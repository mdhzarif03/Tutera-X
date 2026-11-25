import { randomInt } from "node:crypto";
import type { Prisma, Role } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { looksLikePhone, normalizeBdPhone } from "@/lib/phone";
import { sha256 } from "@/lib/crypto";
import { addHours, addMinutes } from "@/lib/dates";
import { audit } from "@/lib/audit";
import { assertPasswordPolicy, hashPassword, verifyPassword } from "@/lib/auth/password";
import { queueSms } from "@/lib/sms/service";
import { render, templates } from "@/lib/sms/templates";
import {
  isPasswordActionAllowed,
  PASSWORD_CHANGE_COOLDOWN_MS,
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_MAX_ATTEMPTS,
  PASSWORD_RESET_OTP_TTL_MINUTES,
} from "@/lib/auth/password-limits";

const GENERIC_FAILURE = "We couldn't sign you in. Check your details and try again.";
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

/**
 * Finds the account that a sign-in identifier points to. Only a login ID or a phone number is accepted.
 * A phone number can belong to a teacher, to a parent, or to the students of one guardian.
 * Returns null when nothing matches. Throws a UserError when several students share the number.
 */
export async function accountWhere(identifier: string): Promise<Prisma.UserWhereInput | null> {
  const id = identifier.trim();
  if (!id) throw new UserError("Enter your login ID or phone number.");
  if (!looksLikePhone(id)) return { username: id.toUpperCase() };

  const phone = normalizeBdPhone(id);
  const teacher = await db.user.findFirst({
    where: { phoneE164: phone, role: "TEACHER", deletedAt: null },
    select: { id: true },
  });
  if (teacher) return { id: teacher.id };

  const parent = await db.parentProfile.findFirst({
    where: { guardian: { phoneE164: phone } },
    select: { userId: true },
  });
  if (parent) return { id: parent.userId };

  const students = await db.studentProfile.findMany({
    where: { archivedAt: null, guardian: { phoneE164: phone } },
    select: { userId: true },
    take: 2,
  });
  if (students.length === 1 && students[0]) return { id: students[0].userId };
  if (students.length > 1) {
    throw new UserError("More than one student uses this number. Sign in with the login ID instead.");
  }
  return null;
}

export async function loginWithPassword(identifier: string, password: string): Promise<{ userId: string; role: Role }> {
  const where = await accountWhere(identifier);
  if (!where) throw new UserError(GENERIC_FAILURE);
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

async function issuePasswordResetCode(userId: string, phone: string, actorId: string, action: string): Promise<boolean> {
  const now = new Date();
  const code = String(randomInt(100_000, 1_000_000));
  const codeHash = await hash(code);
  const body = render(templates.passwordReset, { code, minutes: PASSWORD_RESET_OTP_TTL_MINUTES });

  return db.$transaction(async (tx) => {
    const claimed = await tx.user.updateMany({
      where: {
        id: userId,
        status: "ACTIVE",
        deletedAt: null,
        OR: [
          { passwordResetRequestedAt: null },
          { passwordResetRequestedAt: { lte: new Date(now.getTime() - PASSWORD_RESET_COOLDOWN_MS) } },
        ],
      },
      data: { passwordResetRequestedAt: now },
    });
    if (claimed.count !== 1) return false;

    await tx.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: now },
    });
    const reset = await tx.passwordResetToken.create({
      data: { userId, tokenHash: codeHash, expiresAt: addMinutes(now, PASSWORD_RESET_OTP_TTL_MINUTES) },
    });
    await queueSms(tx, {
      purpose: "PASSWORD_RESET",
      dedupeKey: `reset:${reset.id}`,
      teacherId: null,
      template: templates.passwordReset,
      recipients: [{ studentId: null, phone, body }],
    });
    await audit(tx, { actorId, action, entityType: "user", entityId: userId });
    return true;
  });
}

/** Sends a code when the account can be safely matched and the cooldown has elapsed. */
export async function requestPasswordReset(identifier: string): Promise<void> {
  let where: Prisma.UserWhereInput | null;
  try {
    where = await accountWhere(identifier);
  } catch {
    return;
  }
  if (!where) return;
  const user = await db.user.findFirst({
    where: { ...where, status: "ACTIVE", deletedAt: null },
    select: {
      id: true,
      phoneE164: true,
      passwordResetRequestedAt: true,
      studentProfile: { select: { guardian: { select: { phoneE164: true } } } },
      parentProfile: { select: { guardian: { select: { phoneE164: true } } } },
    },
  });
  const phone = user?.phoneE164 ?? user?.studentProfile?.guardian.phoneE164 ?? user?.parentProfile?.guardian.phoneE164;
  const now = new Date();
  if (
    !user ||
    !phone ||
    !isPasswordActionAllowed(user.passwordResetRequestedAt, PASSWORD_RESET_COOLDOWN_MS, now)
  ) {
    return;
  }

  await issuePasswordResetCode(user.id, phone, user.id, "account.reset_requested");
}

export async function sendTeacherPasswordResetCode(actorId: string, targetId: string): Promise<void> {
  const actor = await db.teacherProfile.findUnique({ where: { userId: actorId }, select: { role: true } });
  if (actor?.role !== "OWNER") throw new UserError("Only the owner can send a teacher reset code.");

  const target = await db.user.findFirst({
    where: { id: targetId, role: "TEACHER", status: "ACTIVE", deletedAt: null },
    select: { id: true, phoneE164: true, passwordResetRequestedAt: true },
  });
  if (!target) throw new UserError("Teacher not found.");
  if (!target.phoneE164) throw new UserError("This teacher has no phone number for SMS password recovery.");
  if (!isPasswordActionAllowed(target.passwordResetRequestedAt, PASSWORD_RESET_COOLDOWN_MS, new Date())) {
    throw new UserError("A reset code was requested within the last 3 days.");
  }
  const sent = await issuePasswordResetCode(target.id, target.phoneE164, actorId, "account.reset_requested_by_owner");
  if (!sent) throw new UserError("A reset code was requested within the last 3 days.");
}

export async function resetPassword(identifier: string, code: string, password: string): Promise<void> {
  assertPasswordPolicy(password);
  if (!/^\d{6}$/.test(code)) throw new UserError("Enter the 6-digit code from the text message.");

  let where: Prisma.UserWhereInput | null;
  try {
    where = await accountWhere(identifier);
  } catch {
    throw new UserError("The code is invalid or expired.");
  }
  if (!where) throw new UserError("The code is invalid or expired.");
  const now = new Date();
  const user = await db.user.findFirst({
    where: { ...where, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  const record = user
    ? await db.passwordResetToken.findFirst({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        select: { id: true, userId: true, tokenHash: true, expiresAt: true, usedAt: true, attempts: true },
      })
    : null;
  if (!record || record.usedAt || record.expiresAt <= now || record.attempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
    throw new UserError("This code is invalid or expired.");
  }

  if (!(await verifyPassword(record.tokenHash, code))) {
    await db.passwordResetToken.updateMany({
      where: {
        id: record.id,
        usedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: PASSWORD_RESET_MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    throw new UserError("The code is incorrect. Check the text message and try again.");
  }

  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: {
        id: record.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
        attempts: { lt: PASSWORD_RESET_MAX_ATTEMPTS },
      },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new UserError("This code is invalid or expired.");

    const changedAt = new Date();
    const updated = await tx.user.updateMany({
      where: { id: record.userId, status: "ACTIVE", deletedAt: null },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    if (updated.count !== 1) throw new UserError("This account is not available for password reset.");
    await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: changedAt } });
    await audit(tx, { actorId: record.userId, action: "account.password_reset", entityType: "user", entityId: record.userId });
  });
}

export async function changePassword(userId: string, next: string, currentSessionId: string): Promise<void> {
  assertPasswordPolicy(next);
  const passwordHash = await hashPassword(next);
  const changedAt = new Date();
  await db.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        status: "ACTIVE",
        deletedAt: null,
        OR: [
          { passwordChangedAt: null },
          { passwordChangedAt: { lte: new Date(changedAt.getTime() - PASSWORD_CHANGE_COOLDOWN_MS) } },
        ],
      },
      data: { passwordHash, passwordChangedAt: changedAt },
    });
    if (updated.count !== 1) throw new UserError("You can change your password once every 7 days.");
    await tx.session.updateMany({
      where: { userId, id: { not: currentSessionId }, revokedAt: null },
      data: { revokedAt: changedAt },
    });
    await audit(tx, { actorId: userId, action: "account.password_changed", entityType: "user", entityId: userId });
  });
}

