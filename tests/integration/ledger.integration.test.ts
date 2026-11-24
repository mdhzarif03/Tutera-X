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
import { configureTestDatabase, testDatabaseSkipReason, testDatabaseUrl } from "./test-database";

type QueueInput = Parameters<typeof import("@/lib/sms/service").queueSms>[1];
type QueueResult = Awaited<ReturnType<typeof import("@/lib/sms/service").queueSms>>;

// Loaded in before(), so DATABASE_URL points at the test database before the client is constructed.
let db: PrismaClient;
let queueSms: (tx: Prisma.TransactionClient, input: QueueInput) => Promise<QueueResult>;
let claimJob: (id: string) => Promise<number | null>;
let runDueJobs: (limit?: number) => Promise<number>;

function oneRecipient(body = "Hi") {
  return { studentId: null, phone: "+8801712345678", body };
}

describe("PostgreSQL: message queue and job claims", { skip: testDatabaseUrl ? false : testDatabaseSkipReason }, () => {
  before(async () => {
    configureTestDatabase();
    db = (await import("@/lib/db")).db;
    queueSms = (await import("@/lib/sms/service")).queueSms;
    claimJob = (await import("@/lib/jobs")).claimJob;
    runDueJobs = (await import("@/lib/jobs")).runDueJobs;
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
    await cleanupMessage(r.messageId);
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
    await cleanupMessage(first.messageId);
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

  test("a terminal recipient lets its job complete without another provider call", async () => {
    const message = await db.smsMessage.create({
      data: { purpose: "BULK_MESSAGE", body: "test", dedupeKey: `it:${randomUUID()}` },
    });
    const recipient = await db.smsRecipient.create({
      data: {
        smsMessageId: message.id,
        phoneE164: "+8801712345678",
        body: "test",
        idempotencyKey: randomUUID(),
        status: "FAILED",
      },
    });
    const job = await db.notificationJob.create({
      data: { kind: "send_sms_recipient", payload: { smsRecipientId: recipient.id }, dedupeKey: `it:${randomUUID()}`, runAfter: new Date(0) },
    });
    assert.equal(await runDueJobs(1), 1);
    assert.equal((await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } })).status, "SUCCEEDED");
    await db.notificationJob.delete({ where: { id: job.id } });
    await db.smsRecipient.delete({ where: { id: recipient.id } });
    await db.smsMessage.delete({ where: { id: message.id } });
  });

  test("provider configuration failure is recorded and retried without losing the job", async () => {
    const message = await db.smsMessage.create({
      data: { purpose: "BULK_MESSAGE", body: "test", dedupeKey: `it:${randomUUID()}` },
    });
    const recipient = await db.smsRecipient.create({
      data: {
        smsMessageId: message.id,
        phoneE164: "+8801712345678",
        body: "test",
        idempotencyKey: randomUUID(),
      },
    });
    const job = await db.notificationJob.create({
      data: { kind: "send_sms_recipient", payload: { smsRecipientId: recipient.id }, dedupeKey: `it:${randomUUID()}`, runAfter: new Date(0) },
    });
    assert.equal(await runDueJobs(1), 1);
    const [retriedJob, retriedRecipient] = await Promise.all([
      db.notificationJob.findUniqueOrThrow({ where: { id: job.id } }),
      db.smsRecipient.findUniqueOrThrow({ where: { id: recipient.id } }),
    ]);
    assert.equal(retriedJob.status, "FAILED_RETRYABLE");
    assert.equal(retriedRecipient.status, "QUEUED");
    assert.equal(await db.smsDeliveryAttempt.count({ where: { smsRecipientId: recipient.id } }), 1);
    await db.notificationJob.delete({ where: { id: job.id } });
    await db.smsDeliveryAttempt.deleteMany({ where: { smsRecipientId: recipient.id } });
    await db.smsRecipient.delete({ where: { id: recipient.id } });
    await db.smsMessage.delete({ where: { id: message.id } });
  });

  test("malformed job payload is recorded as a permanent failure", async () => {
    const job = await db.notificationJob.create({
      data: { kind: "send_sms_recipient", payload: {}, dedupeKey: `it:${randomUUID()}`, runAfter: new Date(0) },
    });
    assert.equal(await runDueJobs(1), 1);
    const failed = await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(failed.status, "FAILED_PERMANENT");
    assert.equal(failed.lastError, "invalid_job_payload");
    await db.notificationJob.delete({ where: { id: job.id } });
  });

  test("two workers processing one due job produce one claim", async () => {
    const job = await db.notificationJob.create({
      data: { kind: "send_sms_recipient", payload: {}, dedupeKey: `it:${randomUUID()}`, runAfter: new Date(0) },
    });
    const results = await Promise.all([runDueJobs(1), runDueJobs(1)]);
    assert.equal(results.reduce((sum, count) => sum + count, 0), 1);
    assert.equal((await db.notificationJob.findUniqueOrThrow({ where: { id: job.id } })).status, "FAILED_PERMANENT");
    await db.notificationJob.delete({ where: { id: job.id } });
  });
});

async function recipientJobKeys(messageId: string | null): Promise<string[]> {
  if (!messageId) return [];
  const rows = await db.smsRecipient.findMany({ where: { smsMessageId: messageId }, select: { id: true } });
  return rows.map((r) => `sms:${r.id}`);
}

async function cleanupMessage(messageId: string | null): Promise<void> {
  if (!messageId) return;
  const rows = await db.smsRecipient.findMany({ where: { smsMessageId: messageId }, select: { id: true } });
  const ids = rows.map((row) => row.id);
  await db.notificationJob.deleteMany({ where: { dedupeKey: { in: ids.map((id) => `sms:${id}`) } } });
  await db.smsDeliveryAttempt.deleteMany({ where: { smsRecipientId: { in: ids } } });
  await db.smsRecipient.deleteMany({ where: { id: { in: ids } } });
  await db.smsMessage.delete({ where: { id: messageId } });
}

// Reported when no database is configured, so the summary can never look like a pass.
if (!testDatabaseUrl) {
  test(`PostgreSQL integration tests did not run: ${testDatabaseSkipReason}`, { skip: true }, () => {});
}
