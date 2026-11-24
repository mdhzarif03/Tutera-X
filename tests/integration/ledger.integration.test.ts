// PostgreSQL integration tests: the message queue and job claims.
//
// These need a real, disposable database with migrations applied:
//   TEST_DATABASE_URL=postgresql://... npx prisma migrate deploy
//   TEST_DATABASE_URL=postgresql://... npm run test:integration
//
// Without TEST_DATABASE_URL the suite reports one explicitly skipped entry, never a pass.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

type QueueInput = Parameters<typeof import("@/lib/sms/service").queueSms>[1];
type QueueResult = Awaited<ReturnType<typeof import("@/lib/sms/service").queueSms>>;

const url = process.env.TEST_DATABASE_URL;

// Loaded in before(), so DATABASE_URL points at the test database before the client is constructed.
let db: PrismaClient;
let queueSms: (tx: Prisma.TransactionClient, input: QueueInput) => Promise<QueueResult>;
let claimJob: (id: string) => Promise<number | null>;

function oneRecipient(body = "Hi") {
  return { studentId: null, phone: "+8801712345678", body };
}

describe("PostgreSQL: message queue and job claims", { skip: url ? false : "TEST_DATABASE_URL is not set" }, () => {
  before(async () => {
    process.env.DATABASE_URL = url as string;
    db = (await import("@/lib/db")).db;
    queueSms = (await import("@/lib/sms/service")).queueSms;
    claimJob = (await import("@/lib/jobs")).claimJob;
  });

  after(async () => {
    await db?.$disconnect();
  });

  test("queueing creates one message row and one job per recipient", async () => {
    const key = `it:${randomUUID()}`;
    const r = await db.$transaction((tx) =>
      queueSms(tx, { purpose: "BULK_MESSAGE", dedupeKey: key, teacherId: null, template: "x", recipients: [oneRecipient(), oneRecipient(), oneRecipient()] }),
    );
    assert.equal(r.created, true);
    assert.equal(r.queued, 3);
    const jobs = await db.notificationJob.count({ where: { dedupeKey: { in: await recipientJobKeys(r.messageId) } } });
    assert.equal(jobs, 3);
  });

  test("queueing the same notice twice creates nothing the second time", async () => {
    const key = `it:${randomUUID()}`;
    const first = await db.$transaction((tx) =>
      queueSms(tx, { purpose: "EXAM_ANNOUNCEMENT", dedupeKey: key, teacherId: null, template: "x", recipients: [oneRecipient()] }),
    );
    const second = await db.$transaction((tx) =>
      queueSms(tx, { purpose: "EXAM_ANNOUNCEMENT", dedupeKey: key, teacherId: null, template: "x", recipients: [oneRecipient(), oneRecipient()] }),
    );
    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.messageId, first.messageId);
    assert.equal(second.queued, 0);
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
    assert.notEqual(await claimJob(job.id), null, "an expired RUNNING lock must be claimable");
  });

  test("a job whose lock is still valid is not reclaimed", async () => {
    const job = await db.notificationJob.create({
      data: { kind: "test_noop", payload: {}, dedupeKey: `it:${randomUUID()}`, status: "RUNNING", lockedUntil: new Date(Date.now() + 60_000) },
    });
    assert.equal(await claimJob(job.id), null);
  });
});

async function recipientJobKeys(messageId: string | null): Promise<string[]> {
  if (!messageId) return [];
  const rows = await db.smsRecipient.findMany({ where: { smsMessageId: messageId }, select: { id: true } });
  return rows.map((r) => `sms:${r.id}`);
}

// Reported when no database is configured, so the summary can never look like a pass.
if (!url) {
  test("PostgreSQL integration tests did not run: TEST_DATABASE_URL is not set", { skip: true }, () => {});
}
