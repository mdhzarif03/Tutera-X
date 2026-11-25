import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { configureTestDatabase, testDatabaseSkipReason, testDatabaseUrl } from "./test-database";

let db: PrismaClient;
let listTeachers: typeof import("@/services/teachers").listTeachers;
let listInvitations: typeof import("@/services/teachers").listInvitations;
let inviteTeacher: typeof import("@/services/teachers").inviteTeacher;
let revokeInvitation: typeof import("@/services/teachers").revokeInvitation;
let setTeacherActive: typeof import("@/services/teachers").setTeacherActive;
let UserError: typeof import("@/lib/errors").UserError;

describe("PostgreSQL: teacher team page data and permissions", { skip: testDatabaseUrl ? false : testDatabaseSkipReason }, () => {
  before(async () => {
    configureTestDatabase();
    db = (await import("@/lib/db")).db;
    ({ listTeachers, listInvitations, inviteTeacher, revokeInvitation, setTeacherActive } = await import("@/services/teachers"));
    ({ UserError } = await import("@/lib/errors"));
  });

  after(async () => {
    await db?.$disconnect();
  });

  test("team data supports the owner as its only teacher and no pending invitations", async () => {
    const owner = await createTeacher("OWNER");
    try {
      const [teachers, invitations] = await Promise.all([listTeachers(), listInvitations(owner.id)]);
      assert.equal(teachers.filter((teacher) => teacher.id === owner.id).length, 1);
      assert.deepEqual(invitations, []);
    } finally {
      await cleanupTeachers([owner.id]);
    }
  });

  test("team data supports multiple teachers and nullable profile details", async () => {
    const owner = await createTeacher("OWNER");
    const member = await createTeacher("TEACHER");
    try {
      const teachers = await listTeachers();
      const team = teachers.filter((teacher) => teacher.id === owner.id || teacher.id === member.id);
      assert.equal(team.length, 2);
      assert.equal(team.find((teacher) => teacher.id === member.id)?.teacherProfile?.subjects, null);
      assert.equal(team.find((teacher) => teacher.id === member.id)?.teacherProfile?.institutionName, null);
    } finally {
      await cleanupTeachers([owner.id, member.id]);
    }
  });

  test("only an active owner can invite, revoke invitations, or change teacher access", async () => {
    const owner = await createTeacher("OWNER");
    const member = await createTeacher("TEACHER");
    const target = await createTeacher("TEACHER");
    const phone = `017${randomInt(10_000_000, 99_999_999)}`;
    try {
      await assert.rejects(inviteTeacher(member.id, phone), UserError);
      await assert.rejects(setTeacherActive(member.id, target.id, false), UserError);

      await inviteTeacher(owner.id, phone);
      const invitation = await db.teacherInvitation.findUniqueOrThrow({ where: { phoneE164: `+88${phone.slice(1)}` } });
      assert.equal((await listInvitations(owner.id)).length, 1);
      assert.deepEqual(await listInvitations(member.id), []);
      await assert.rejects(revokeInvitation(member.id, invitation.id), UserError);

      await revokeInvitation(owner.id, invitation.id);
      assert.deepEqual(await listInvitations(owner.id), []);
      await setTeacherActive(owner.id, target.id, false);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status, "DISABLED");
      await setTeacherActive(owner.id, target.id, true);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: target.id } })).status, "ACTIVE");
    } finally {
      await cleanupTeachers([owner.id, member.id, target.id]);
    }
  });
});

async function createTeacher(role: "OWNER" | "TEACHER"): Promise<{ id: string }> {
  const marker = randomUUID();
  return db.user.create({
    data: {
      role: "TEACHER",
      phoneE164: `+88017${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
      name: `Integration ${role.toLowerCase()} ${marker}`,
      teacherProfile: { create: { role } },
    },
    select: { id: true },
  });
}

async function cleanupTeachers(userIds: string[]): Promise<void> {
  const invitations = await db.teacherInvitation.findMany({
    where: { invitedById: { in: userIds } },
    select: { id: true },
  });
  const messages = invitations.length
    ? await db.smsMessage.findMany({
        where: { OR: invitations.map(({ id }) => ({ dedupeKey: { startsWith: `teacher-invite:${id}:` } })) },
        select: { id: true },
      })
    : [];
  const messageIds = messages.map((message) => message.id);
  const recipients = await db.smsRecipient.findMany({
    where: { smsMessageId: { in: messageIds } },
    select: { id: true },
  });
  const recipientIds = recipients.map((recipient) => recipient.id);

  await db.notificationJob.deleteMany({ where: { dedupeKey: { in: recipientIds.map((id) => `sms:${id}`) } } });
  await db.smsDeliveryAttempt.deleteMany({ where: { smsRecipientId: { in: recipientIds } } });
  await db.smsRecipient.deleteMany({ where: { id: { in: recipientIds } } });
  await db.smsMessage.deleteMany({ where: { id: { in: messageIds } } });
  await db.teacherInvitation.deleteMany({ where: { invitedById: { in: userIds } } });
  await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await db.teacherProfile.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
}

if (!testDatabaseUrl) {
  test(`PostgreSQL teacher team integration tests did not run: ${testDatabaseSkipReason}`, { skip: true }, () => {});
}
