import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { configureTestDatabase, testDatabaseSkipReason, testDatabaseUrl } from "./test-database";

let db: PrismaClient;
let requestPasswordReset: typeof import("@/services/accounts").requestPasswordReset;
let resetPassword: typeof import("@/services/accounts").resetPassword;
let changePassword: typeof import("@/services/accounts").changePassword;
let UserError: typeof import("@/lib/errors").UserError;

describe("PostgreSQL: password recovery and cooldowns", { skip: testDatabaseUrl ? false : testDatabaseSkipReason }, () => {
  before(async () => {
    configureTestDatabase();
    db = (await import("@/lib/db")).db;
    ({ requestPasswordReset, resetPassword, changePassword } = await import("@/services/accounts"));
    ({ UserError } = await import("@/lib/errors"));
  });

  after(async () => {
    await db?.$disconnect();
  });

  test("sends a single reset code, counts incorrect attempts, and resets the password", async () => {
    const user = await createUser();
    try {
      await requestPasswordReset(user.email);
      await Promise.all([requestPasswordReset(user.email), requestPasswordReset(user.email)]);

      const reset = await db.passwordResetToken.findFirstOrThrow({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      });
      assert.equal(await db.passwordResetToken.count({ where: { userId: user.id } }), 1);
      const requestedAt = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordResetRequestedAt;
      assert.ok(requestedAt);
      assert.ok(Math.abs(requestedAt.getTime() - reset.createdAt.getTime()) < 5_000);

      const message = await db.smsMessage.findUniqueOrThrow({ where: { dedupeKey: `reset:${reset.id}` } });
      const recipient = await db.smsRecipient.findFirstOrThrow({ where: { smsMessageId: message.id } });
      const code = recipient.body.match(/\b\d{6}\b/)?.[0];
      assert.ok(code, "queued SMS should contain a six-digit reset code");

      const wrongCode = code === "000000" ? "000001" : "000000";
      await assert.rejects(resetPassword(user.email, wrongCode, "new-password-123"), UserError);
      assert.equal((await db.passwordResetToken.findUniqueOrThrow({ where: { id: reset.id } })).attempts, 1);

      const session = await db.session.create({
        data: {
          userId: user.id,
          tokenHash: randomUUID(),
          csrfSecret: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
        },
      });
      await resetPassword(user.email, code, "new-password-123");
      const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.equal(updated.passwordChangedAt, null);
      assert.ok(await (await import("@/lib/auth/password")).verifyPassword(updated.passwordHash!, "new-password-123"));
      assert.ok((await db.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt);
      await requestPasswordReset(user.email);
      assert.equal(await db.passwordResetToken.count({ where: { userId: user.id } }), 1);

      const currentSession = await createSession(user.id);
      await changePassword(user.id, "after-reset-password-456", currentSession.id);
      assert.ok((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordChangedAt);
      await assert.rejects(changePassword(user.id, "another-password-123", currentSession.id), UserError);
    } finally {
      await cleanupUser(user.id);
    }
  });

  test("a signed-in password change needs no old password and enforces the seven-day cooldown", async () => {
    const user = await createUser({ passwordChangedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
    try {
      const currentSession = await createSession(user.id);
      const otherSession = await createSession(user.id);
      await changePassword(user.id, "new-password-123", currentSession.id);
      const updated = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.ok(updated.passwordChangedAt);
      assert.ok(await (await import("@/lib/auth/password")).verifyPassword(updated.passwordHash!, "new-password-123"));
      assert.equal((await db.session.findUniqueOrThrow({ where: { id: currentSession.id } })).revokedAt, null);
      assert.ok((await db.session.findUniqueOrThrow({ where: { id: otherSession.id } })).revokedAt);
      await assert.rejects(changePassword(user.id, "another-password-123", currentSession.id), UserError);
    } finally {
      await cleanupUser(user.id);
    }
  });

  test("a teacher without a phone cannot receive a reset SMS", async () => {
    const user = await createUser({ phoneE164: null });
    try {
      await requestPasswordReset(user.email);
      assert.equal(await db.passwordResetToken.count({ where: { userId: user.id } }), 0);
      assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).passwordResetRequestedAt, null);
    } finally {
      await cleanupUser(user.id);
    }
  });
});

async function createUser(overrides: { phoneE164?: string | null; passwordChangedAt?: Date } = {}) {
  const marker = randomUUID();
  const email = `password-${marker}@integration.invalid`;
  const user = await db.user.create({
    data: {
      role: "TEACHER",
      email,
      phoneE164: overrides.phoneE164 === null ? null : overrides.phoneE164 ?? `+88017${randomInt(10_000_000, 99_999_999)}`,
      name: `Integration teacher ${marker}`,
      passwordChangedAt: overrides.passwordChangedAt,
      teacherProfile: { create: { role: "OWNER" } },
    },
    select: { id: true },
  });
  return { id: user.id, email };
}

function createSession(userId: string) {
  return db.session.create({
    data: {
      userId,
      tokenHash: randomUUID(),
      csrfSecret: randomUUID(),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
}

async function cleanupUser(userId: string): Promise<void> {
  const resets = await db.passwordResetToken.findMany({ where: { userId }, select: { id: true } });
  const messages = await db.smsMessage.findMany({
    where: { dedupeKey: { in: resets.map((reset) => `reset:${reset.id}`) } },
    select: { id: true },
  });
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
  await db.passwordResetToken.deleteMany({ where: { userId } });
  await db.session.deleteMany({ where: { userId } });
  await db.auditLog.deleteMany({ where: { actorId: userId } });
  await db.teacherProfile.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
}

if (!testDatabaseUrl) {
  test(`PostgreSQL password recovery tests did not run: ${testDatabaseSkipReason}`, { skip: true }, () => {});
}
