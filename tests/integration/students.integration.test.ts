import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { configureTestDatabase, testDatabaseSkipReason, testDatabaseUrl } from "./test-database";

type StudentInput = Parameters<typeof import("@/services/students").createStudent>[1];

let db: PrismaClient;
let createStudent: typeof import("@/services/students").createStudent;
let parseStudentInput: typeof import("@/services/students").parseStudentInput;
let UserError: typeof import("@/lib/errors").UserError;

interface Fixture {
  teacherId: string;
  phone: string;
  studentIds: string[];
  batchIds: string[];
  extraUserIds: string[];
}

describe("PostgreSQL: student creation", { skip: testDatabaseUrl ? false : testDatabaseSkipReason }, () => {
  before(async () => {
    configureTestDatabase();
    db = (await import("@/lib/db")).db;
    ({ createStudent, parseStudentInput } = await import("@/services/students"));
    ({ UserError } = await import("@/lib/errors"));
  });

  after(async () => {
    await db?.$disconnect();
  });

  test("creates the student graph and queues activation SMS in one transaction", async () => {
    const fixture = await createFixture();
    try {
      const input = studentInput(fixture.phone);
      const result = await createStudent(fixture.teacherId, input);
      fixture.studentIds.push(result.studentId);

      const user = await db.user.findUniqueOrThrow({
        where: { id: result.studentId },
        include: { studentProfile: { include: { guardian: true } } },
      });
      assert.equal(user.role, "STUDENT");
      assert.equal(user.status, "PENDING_ACTIVATION");
      assert.equal(user.username, result.username);
      assert.equal(user.studentProfile?.guardian.phoneE164, fixture.phone);
      assert.equal(user.studentProfile?.className, "Class 8");
      assert.equal(await db.teacherStudent.count({ where: { teacherId: fixture.teacherId, studentId: result.studentId } }), 1);
      assert.equal(await db.batchStudent.count({ where: { studentId: result.studentId } }), 0, "an omitted optional batch creates no membership");
      assert.equal(await db.studentActivation.count({ where: { userId: result.studentId } }), 1);

      const recipient = await db.smsRecipient.findFirstOrThrow({ where: { studentId: result.studentId } });
      assert.equal(recipient.status, "QUEUED");
      assert.equal(await db.notificationJob.count({ where: { dedupeKey: `sms:${recipient.id}` } }), 1);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  test("assigns the new student to the selected teacher-owned batch", async () => {
    const fixture = await createFixture();
    try {
      const batch = await db.batch.create({
        data: { teacherId: fixture.teacherId, name: `Integration batch ${randomUUID()}`, className: "Class 8" },
      });
      fixture.batchIds.push(batch.id);
      const result = await createStudent(fixture.teacherId, { ...studentInput(fixture.phone), batchId: batch.id });
      fixture.studentIds.push(result.studentId);

      const membership = await db.batchStudent.findUniqueOrThrow({
        where: { batchId_studentId: { batchId: batch.id, studentId: result.studentId } },
      });
      assert.equal(membership.leftAt, null);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  test("concurrent duplicate submissions create at most one student", async () => {
    const fixture = await createFixture();
    try {
      const input = studentInput(fixture.phone);
      const results = await Promise.allSettled([
        createStudent(fixture.teacherId, input),
        createStudent(fixture.teacherId, input),
      ]);
      const successful = results.filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createStudent>>> => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      fixture.studentIds.push(...successful.map((result) => result.value.studentId));
      assert.equal(successful.length, 1);
      assert.equal(rejected.length, 1);
      const rejection = rejected[0];
      assert.ok(rejection?.status === "rejected");
      assert.ok(rejection.reason instanceof UserError);
      assert.equal(await db.teacherStudent.count({ where: { teacherId: fixture.teacherId } }), 1);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  test("rejects a missing batch before creating student records", async () => {
    const fixture = await createFixture();
    try {
      const input = { ...studentInput(fixture.phone), batchId: `missing-${randomUUID()}` };
      await assert.rejects(createStudent(fixture.teacherId, input), UserError);
      assert.equal(await db.teacherStudent.count({ where: { teacherId: fixture.teacherId } }), 0);
      assert.equal(await db.smsMessage.count({ where: { teacherId: fixture.teacherId } }), 0);
    } finally {
      await cleanupFixture(fixture);
    }
  });

  test("rejects creation for an account that is not an active teacher", async () => {
    const fixture = await createFixture();
    try {
      const studentActor = await db.user.create({ data: { role: "STUDENT", name: `Unauthorized ${randomUUID()}` } });
      fixture.extraUserIds.push(studentActor.id);
      await assert.rejects(createStudent(studentActor.id, studentInput(fixture.phone)), UserError);
      assert.equal(await db.teacherStudent.count({ where: { teacherId: fixture.teacherId } }), 0);
      assert.equal(await db.smsMessage.count({ where: { teacherId: fixture.teacherId } }), 0);
    } finally {
      await cleanupFixture(fixture);
    }
  });
});

function studentInput(phone: string): StudentInput {
  return parseStudentInput({
    name: `Integration student ${randomUUID()}`,
    guardianPhone: phone,
    className: "Class 8",
    version: "English Version",
    studentGroup: "",
    institution: "Integration school",
    monthlyFee: "500",
    batchId: "",
  });
}

async function createFixture(): Promise<Fixture> {
  const marker = randomUUID();
  const phone = `017${String(Math.floor(10_000_000 + Math.random() * 89_999_999))}`;
  const user = await db.user.create({
    data: {
      role: "TEACHER",
      phoneE164: `+88017${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
      name: `Integration teacher ${marker}`,
      teacherProfile: { create: { role: "OWNER" } },
    },
    select: { id: true },
  });
  return { teacherId: user.id, phone, studentIds: [], batchIds: [], extraUserIds: [] };
}

async function cleanupFixture(fixture: Fixture): Promise<void> {
  const messages = await db.smsMessage.findMany({ where: { teacherId: fixture.teacherId }, select: { id: true } });
  const messageIds = messages.map((message) => message.id);
  const recipients = await db.smsRecipient.findMany({ where: { smsMessageId: { in: messageIds } }, select: { id: true } });
  const recipientIds = recipients.map((recipient) => recipient.id);

  await db.notificationJob.deleteMany({ where: { dedupeKey: { in: recipientIds.map((id) => `sms:${id}`) } } });
  await db.smsDeliveryAttempt.deleteMany({ where: { smsRecipientId: { in: recipientIds } } });
  await db.smsRecipient.deleteMany({ where: { id: { in: recipientIds } } });
  await db.smsMessage.deleteMany({ where: { id: { in: messageIds } } });
  await db.studentActivation.deleteMany({ where: { userId: { in: fixture.studentIds } } });
  await db.batchStudent.deleteMany({ where: { studentId: { in: fixture.studentIds } } });
  await db.teacherStudent.deleteMany({ where: { studentId: { in: fixture.studentIds } } });
  await db.teacherStudent.deleteMany({ where: { teacherId: fixture.teacherId } });
  await db.batch.deleteMany({ where: { id: { in: fixture.batchIds } } });
  await db.auditLog.deleteMany({ where: { actorId: fixture.teacherId } });
  await db.studentProfile.deleteMany({ where: { userId: { in: fixture.studentIds } } });
  await db.guardian.deleteMany({ where: { phoneE164: fixture.phone } });
  await db.teacherProfile.deleteMany({ where: { userId: fixture.teacherId } });
  await db.user.deleteMany({ where: { id: { in: [fixture.teacherId, ...fixture.studentIds, ...fixture.extraUserIds] } } });
}

if (!testDatabaseUrl) {
  test(`PostgreSQL student integration tests did not run: ${testDatabaseSkipReason}`, { skip: true }, () => {});
}
