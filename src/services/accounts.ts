import type { Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { looksLikePhone, normalizeBdPhone } from "@/lib/phone";
import { randomToken, sha256 } from "@/lib/crypto";
import { addHours, addMinutes } from "@/lib/dates";
import { audit } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { assertPasswordPolicy, hashPassword, verifyPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/session";
import { queueSms } from "@/lib/sms/service";
import { render, templates } from "@/lib/sms/templates";

const GENERIC_FAILURE = "We couldn't sign you in. Check your details and try again.";
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

/** Resolves an identifier typed by a user: email (teachers), username (students, parents), or phone. */
export function identifierWhere(identifier: string): Prisma.UserWhereInput {
  const id = identifier.trim();
  if (!id) throw new UserError("Enter your username, phone number or email.");
  if (id.includes("@")) return { email: id.toLowerCase() };
  if (looksLikePhone(id)) return { phoneE164: normalizeBdPhone(id) };
  return { username: id.toUpperCase() };
}

export async function loginWithPassword(identifier: string, password: string): Promise<{ userId: string; role: Role }> {
  let where: Prisma.UserWhereInput;
  try {
    where = identifierWhere(identifier);
  } catch {
    throw new UserError(GENERIC_FAILURE);
  }
  const user = await db.user.findFirst({
    where,
    select: { id: true, role: true, status: true, passwordHash: true, failedLoginCount: true, lockedUntil: true, deletedAt: true },
  });
  if (!user || !user.passwordHash || user.deletedAt || user.status === "DISABLED") throw new UserError(GENERIC_FAILURE);
  if (user.status === "PENDING_ACTIVATION") {
    throw new UserError("Please set your password first, using the welcome link we texted you.");
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    throw new UserError(`Too many tries. Please wait ${LOCK_MINUTES} minutes and try again.`);
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    const failures = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failures,
        lockedUntil: failures >= MAX_FAILURES ? addMinutes(now, LOCK_MINUTES) : null,
      },
    });
    throw new UserError(GENERIC_FAILURE);
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
  });
  return { userId: user.id, role: user.role };
}

/** Consumes a first-time activation token and sets the password. */
export async function activateAccount(token: string, password: string): Promise<{ userId: string; role: Role }> {
  assertPasswordPolicy(password);
  const record = await db.studentActivation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, role: true, status: true } } },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new UserError("This welcome link is no longer valid. Ask your teacher to send a new one.");
  }
  if (record.user.status !== "PENDING_ACTIVATION") {
    throw new UserError("This account is ready. Please sign in.");
  }

  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash, status: "ACTIVE", failedLoginCount: 0 } });
    await tx.studentActivation.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: new Date() } });
    await audit(tx, { actorId: record.userId, action: "account.activated", entityType: "user", entityId: record.userId });
  });
  return { userId: record.user.id, role: record.user.role };
}

/**
 * Sends a reset link to the phone number on file. The response never reveals whether the account
 * exists. Teachers and students without a phone number must ask the owner for help.
 */
export async function requestPasswordReset(identifier: string): Promise<void> {
  let where: Prisma.UserWhereInput;
  try {
    where = identifierWhere(identifier);
  } catch {
    return;
  }
  const user = await db.user.findFirst({
    where: { ...where, status: "ACTIVE", deletedAt: null },
    select: { id: true, phoneE164: true, role: true },
  });
  if (!user?.phoneE164) return;

  const token = randomToken(32);
  const link = `${getEnv().APP_URL.replace(/\/$/, "")}/reset#${token}`;
  const body = render(templates.passwordReset, { link });

  await db.$transaction(async (tx) => {
    const reset = await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: addHours(new Date(), 1) },
    });
    await queueSms(tx, {
      purpose: "PASSWORD_RESET",
      dedupeKey: `reset:${reset.id}`,
      teacherId: null,
      template: templates.passwordReset,
      recipients: [{ studentId: null, phone: user.phoneE164 as string, body }],
    });
    await audit(tx, { actorId: user.id, action: "account.reset_requested", entityType: "user", entityId: user.id });
  });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  assertPasswordPolicy(password);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new UserError("This link is no longer valid. Request a new one.");
  }
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, { actorId: record.userId, action: "account.password_reset", entityType: "user", entityId: record.userId });
  });
}

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  assertPasswordPolicy(next);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, current))) {
    throw new UserError("Your current password isn't right.");
  }
  const passwordHash = await hashPassword(next);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await audit(tx, { actorId: userId, action: "account.password_changed", entityType: "user", entityId: userId });
  });
  await revokeAllSessions(userId);
}

