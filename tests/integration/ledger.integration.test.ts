// PostgreSQL integration tests: transactions, allowance reservations, settlement, refunds, concurrency.
//
// These need a real, disposable database with migrations applied:
//   TEST_DATABASE_URL=postgresql://... npx prisma migrate deploy
//   TEST_DATABASE_URL=postgresql://... npm run test:integration
//
// Without TEST_DATABASE_URL the suite reports one explicitly skipped entry, never a pass.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, SmsAllowanceKind } from "@prisma/client";

type QueueInput = Parameters<typeof import("@/lib/sms/service").queueSms>[1];
type QueueResult = Awaited<ReturnType<typeof import("@/lib/sms/service").queueSms>>;

const url = process.env.TEST_DATABASE_URL;

// Loaded in before(), so DATABASE_URL points at the test database before the client is constructed.
let db: PrismaClient;
let reserveCredits: (tx: Prisma.TransactionClient, teacherId: string, n: number) => Promise<boolean>;
let settle: (tx: Prisma.TransactionClient, recipientId: string, actual: number | null) => Promise<unknown>;
let refund: (tx: Prisma.TransactionClient, recipientId: string) => Promise<void>;
let adjustAllowance: (actor: string, teacher: string, delta: number, note: string | null) => Promise<void>;
let queueSms: (tx: Prisma.TransactionClient, input: QueueInput) => Promise<QueueResult>;
let claimJob: (id: string) => Promise<number | null>;

async function makeTeacher(allowance: number, role: "OWNER" | "TEACHER" = "TEACHER"): Promise<string> {
  const id = randomUUID();
  await db.user.create({
    data: {
      id,
      role: "TEACHER",
      email: `it-${id}@test.invalid`,
      name: "Integration Teacher",
      status: "ACTIVE",
      teacherProfile: { create: { role, smsAllowance: allowance } },
    },
  });
  return id;
}

async function profile(teacherId: string) {
  return db.teacherProfile.findUniqueOrThrow({
    where: { userId: teacherId },
    select: { smsAllowance: true, smsCreditsUsed: true, smsCreditsReserved: true },
  });
}

async function ledger(teacherId: string, kind: SmsAllowanceKind): Promise<number> {
  const r = await db.smsAllowanceEntry.aggregate({ where: { teacherId, kind }, _sum: { credits: true } });
  return r._sum.credits ?? 0;
}

/** The recipient created by a queueSms call. Fails the test clearly if no message was created. */
async function recipientOf(result: QueueResult) {
  if (!result.messageId) throw new Error("queueSms created no message");
  return db.smsRecipient.findFirstOrThrow({ where: { smsMessageId: result.messageId } });
}

function oneRecipient(body = "Hi") {
  return [{ studentId: null, phone: "+8801712345678", body }];
}

describe("PostgreSQL: allowance and queue integrity", { skip: url ? false : "TEST_DATABASE_URL is not set" }, () => {
  before(async () => {
    process.env.DATABASE_URL = url as string;
    db = (await import("@/lib/db")).db;
    const allowance = await import("@/lib/sms/allowance");
    reserveCredits = allowance.reserveCredits;
    settle = allowance.settleRecipientCredits;
    refund = allowance.refundProviderCredits;
    adjustAllowance = allowance.adjustAllowance;
    queueSms = (await import("@/lib/sms/service")).queueSms;
    claimJob = (await import("@/lib/jobs")).claimJob;
  });

  after(async () => {
    await db?.$disconnect();
  });

  test("100 concurrent reservations never exceed a 10-credit allowance", async () => {
    const id = await makeTeacher(10);
    const outcomes = await Promise.all(
      Array.from({ length: 100 }, () => db.$transaction((tx) => reserveCredits(tx, id, 1))),
    );
    assert.equal(outcomes.filter(Boolean).length, 10, "exactly 10 reservations must succeed");
    const p = await profile(id);
    assert.equal(p.smsCreditsReserved, 10);
    assert.ok(p.smsCreditsUsed + p.smsCreditsReserved <= p.smsAllowance);
  });

  test("a strict send over the allowance is refused and leaves no rows behind", async () => {
    const id = await makeTeacher(2);
    const messagesBefore = await db.smsMessage.count({ where: { teacherId: id } });
    await assert.rejects(
      db.$transaction((tx) =>
        queueSms(tx, {
          purpose: "BULK_MESSAGE",
          dedupeKey: `it:${randomUUID()}`,
          teacherId: id,
          template: "x",
          recipients: [...oneRecipient(), ...oneRecipient(), ...oneRecipient()],
          allowance: "strict",
        }),
      ),
    );
    assert.equal(await db.smsMessage.count({ where: { teacherId: id } }), messagesBefore);
    const p = await profile(id);
    assert.equal(p.smsCreditsReserved, 0, "the rolled-back transaction must release its reservations");
  });

  test("a skip-mode notice over the allowance is recorded as skipped and does not fail", async () => {
    const id = await makeTeacher(2);
    const r = await db.$transaction((tx) =>
      queueSms(tx, {
        purpose: "ABSENCE_NOTICE",
        dedupeKey: `it:${randomUUID()}`,
        teacherId: id,
        template: "x",
        recipients: [...oneRecipient(), ...oneRecipient(), ...oneRecipient(), ...oneRecipient(), ...oneRecipient()],
        allowance: "skip",
      }),
    );
    assert.equal(r.queued, 2);
    assert.equal(r.skipped, 3);
    const skipped = await db.smsRecipient.count({ where: { smsMessage: { teacherId: id }, status: "SKIPPED", skipReason: "allowance_exhausted" } });
    assert.equal(skipped, 3);
    assert.equal((await profile(id)).smsCreditsReserved, 2);
  });

  test("settlement is idempotent: a second settle changes nothing", async () => {
    const id = await makeTeacher(10);
    const r = await db.$transaction((tx) =>
      queueSms(tx, { purpose: "BULK_MESSAGE", dedupeKey: `it:${randomUUID()}`, teacherId: id, template: "x", recipients: oneRecipient(), allowance: "strict", minCredits: 2 }),
    );
    const rec = await recipientOf(r);
    await db.$transaction((tx) => settle(tx, rec.id, 1));
    await db.$transaction((tx) => settle(tx, rec.id, 1));
    const p = await profile(id);
    assert.equal(p.smsCreditsUsed, 1);
    assert.equal(p.smsCreditsReserved, 0);
    assert.equal(await ledger(id, "CONSUME"), 1);
    assert.equal(await ledger(id, "RELEASE"), 2);
  });

  test("a provider bill above the reservation is recorded as overage and blocks further reservations", async () => {
    const id = await makeTeacher(2);
    const r = await db.$transaction((tx) =>
      queueSms(tx, { purpose: "BULK_MESSAGE", dedupeKey: `it:${randomUUID()}`, teacherId: id, template: "x", recipients: oneRecipient(), allowance: "strict", minCredits: 1 }),
    );
    const rec = await recipientOf(r);
    await db.$transaction((tx) => settle(tx, rec.id, 4));
    const p = await profile(id);
    assert.equal(p.smsCreditsUsed, 4, "every billed credit is consumed");
    assert.equal(await ledger(id, "OVERAGE"), 3, "the excess above the reservation is recorded");
    const allowed = await db.$transaction((tx) => reserveCredits(tx, id, 1));
    assert.equal(allowed, false, "an overdrawn allowance accepts no new reservations");
  });

  test("a provider refund after acceptance returns the consumed credits", async () => {
    const id = await makeTeacher(10);
    const r = await db.$transaction((tx) =>
      queueSms(tx, { purpose: "BULK_MESSAGE", dedupeKey: `it:${randomUUID()}`, teacherId: id, template: "x", recipients: oneRecipient(), allowance: "strict", minCredits: 1 }),
    );
    const rec = await recipientOf(r);
    await db.$transaction((tx) => settle(tx, rec.id, 3));
    await db.smsRecipient.update({ where: { id: rec.id }, data: { status: "ACCEPTED", credits: 3 } });
    assert.equal((await profile(id)).smsCreditsUsed, 3);
    await db.$transaction((tx) => refund(tx, rec.id));
    assert.equal((await profile(id)).smsCreditsUsed, 0);
  });

  test("the owner cannot reduce an allowance below what is used or reserved", async () => {
    const teacher = await makeTeacher(10);
    const owner = await makeTeacher(0, "OWNER");
    const r = await db.$transaction((tx) =>
      queueSms(tx, { purpose: "BULK_MESSAGE", dedupeKey: `it:${randomUUID()}`, teacherId: teacher, template: "x", recipients: oneRecipient(), allowance: "strict", minCredits: 4 }),
    );
    const rec = await recipientOf(r);
    await db.$transaction((tx) => settle(tx, rec.id, 4));
    await assert.rejects(adjustAllowance(owner, teacher, -7, "too far"));
    await adjustAllowance(owner, teacher, -6, "to the floor");
    assert.equal((await profile(teacher)).smsAllowance, 4);
  });

  test("a non-owner cannot change an allowance", async () => {
    const teacher = await makeTeacher(10);
    const other = await makeTeacher(0);
    await assert.rejects(adjustAllowance(other, teacher, 100, "self-grant"));
    assert.equal((await profile(teacher)).smsAllowance, 10);
  });

  test("concurrent claims on one job: exactly one worker wins", async () => {
    const job = await db.notificationJob.create({ data: { kind: "test_noop", payload: {}, dedupeKey: `it:${randomUUID()}` } });
    const wins = await Promise.all(Array.from({ length: 20 }, () => claimJob(job.id)));
    assert.equal(wins.filter((w) => w !== null).length, 1);
  });

  test("a job left RUNNING by a crashed worker is reclaimed after its lock expires", async () => {
    const job = await db.notificationJob.create({
      data: { kind: "test_noop", payload: {}, dedupeKey: `it:${randomUUID()}`, status: "RUNNING", lockedUntil: new Date(Date.now() - 1000) },
    });
    const attempt = await claimJob(job.id);
    assert.notEqual(attempt, null, "an expired RUNNING lock must be claimable");
  });

  test("a job whose lock is still valid is not reclaimed", async () => {
    const job = await db.notificationJob.create({
      data: { kind: "test_noop", payload: {}, dedupeKey: `it:${randomUUID()}`, status: "RUNNING", lockedUntil: new Date(Date.now() + 60_000) },
    });
    assert.equal(await claimJob(job.id), null);
  });
});

// Reported when no database is configured, so the summary can never look like a pass.
if (!url) {
  test("PostgreSQL integration tests did not run: TEST_DATABASE_URL is not set", { skip: true }, () => {});
}
