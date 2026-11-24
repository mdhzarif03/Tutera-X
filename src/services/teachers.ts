import { db } from "@/lib/db";
import { UserError, isUniqueViolation } from "@/lib/errors";
import { randomToken, sha256 } from "@/lib/crypto";
import { addHours } from "@/lib/dates";
import { audit } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { assertPasswordPolicy, hashPassword } from "@/lib/auth/password";
import { optionalText, requireText } from "@/lib/validate";
import { normalizeBdPhone } from "@/lib/phone";
import { queueSms } from "@/lib/sms/service";
import { render, templates } from "@/lib/sms/templates";

export async function listTeachers() {
  return db.user.findMany({
    where: { role: "TEACHER", deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      phoneE164: true,
      status: true,
      lastLoginAt: true,
      teacherProfile: { select: { role: true, subjects: true, institutionName: true } },
    },
  });
}

export async function listInvitations() {
  return db.teacherInvitation.findMany({
    where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, phoneE164: true, expiresAt: true, invitedById: true },
  });
}

/** Creates an invitation and queues its one-time link to the teacher's phone. */
export async function inviteTeacher(actorId: string, phoneRaw: string): Promise<void> {
  const phoneE164 = normalizeBdPhone(requireText(phoneRaw, "Phone number", 20));
  const existing = await db.user.findUnique({ where: { phoneE164 }, select: { id: true } });
  if (existing) throw new UserError("This phone number already has an account.");

  const token = randomToken(32);
  const tokenHash = sha256(token);
  const now = new Date();
  const expiresAt = addHours(now, 72);
  try {
    await db.$transaction(async (tx) => {
      const previous = await tx.teacherInvitation.findUnique({ where: { phoneE164 } });
      if (previous && previous.acceptedAt === null && previous.revokedAt === null && previous.expiresAt > now) {
        throw new UserError("An invitation was already sent to this phone number.");
      }

      const inv = previous
        ? await tx.teacherInvitation.update({
            where: { id: previous.id },
            data: { email: null, tokenHash, invitedById: actorId, expiresAt, acceptedAt: null, revokedAt: null, createdAt: now },
          })
        : await tx.teacherInvitation.create({
            data: { phoneE164, tokenHash, invitedById: actorId, expiresAt },
          });
      const body = render(templates.teacherInvitation, { link: inviteUrl(token) });
      await queueSms(tx, {
        purpose: "TEACHER_INVITATION",
        dedupeKey: `teacher-invite:${inv.id}:${tokenHash}`,
        teacherId: actorId,
        template: templates.teacherInvitation,
        recipients: [{ studentId: null, phone: phoneE164, body }],
      });
      await audit(tx, { actorId, action: "teacher.invite", entityType: "invitation", entityId: inv.id, changes: { phoneE164 } });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("An invitation was already sent to this phone number.");
    throw err;
  }
}

/**
 * The token sits in the URL fragment. Browsers never send a fragment to the server, so it does not
 * reach access logs, proxies, or Referer headers. The accept page exchanges it via a POST.
 */
export function inviteUrl(token: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}/accept-invite#${token}`;
}

export async function revokeInvitation(actorId: string, invitationId: string): Promise<void> {
  const inv = await db.teacherInvitation.findFirst({ where: { id: invitationId, invitedById: actorId, acceptedAt: null } });
  if (!inv) throw new UserError("Invitation not found.");
  await db.teacherInvitation.update({ where: { id: inv.id }, data: { revokedAt: new Date() } });
}

export async function acceptInvitation(
  token: string,
  nameRaw: string,
  subjectsRaw: string,
  institutionNameRaw: string,
  password: string,
): Promise<string> {
  const name = requireText(nameRaw, "Name", 120);
  const subjects = optionalText(subjectsRaw, 200);
  const institutionName = optionalText(institutionNameRaw, 120);
  assertPasswordPolicy(password);
  const inv = await db.teacherInvitation.findUnique({ where: { tokenHash: sha256(token) } });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) {
    throw new UserError("This link has expired or was already used.");
  }
  if (!inv.email && !inv.phoneE164) throw new UserError("This invitation has no contact number.");
  const passwordHash = await hashPassword(password);
  try {
    return await db.$transaction(async (tx) => {
      // Claim the invitation first: a concurrent second acceptance matches zero rows and fails.
      const claimed = await tx.teacherInvitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new UserError("This link was already used.");
      const user = await tx.user.create({
        data: {
          role: "TEACHER",
          email: inv.email,
          phoneE164: inv.phoneE164,
          name,
          passwordHash,
          status: "ACTIVE",
          teacherProfile: { create: { role: "TEACHER", subjects, institutionName } },
        },
        select: { id: true },
      });
      await audit(tx, {
        actorId: user.id,
        action: "teacher.joined",
        entityType: "user",
        entityId: user.id,
        changes: { subjects, institutionName },
      });
      return user.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new UserError(inv.phoneE164 ? "This phone number already has an account." : "This email already has an account.");
    }
    throw err;
  }
}

export async function setTeacherActive(actorId: string, targetId: string, active: boolean): Promise<void> {
  const actor = await db.teacherProfile.findUnique({ where: { userId: actorId }, select: { role: true } });
  if (actor?.role !== "OWNER") throw new UserError("Only the owner can turn teachers' access on or off.");
  if (actorId === targetId) throw new UserError("You can't change your own access.");
  const target = await db.user.findFirst({
    where: { id: targetId, role: "TEACHER" },
    select: { id: true, teacherProfile: { select: { role: true } } },
  });
  if (!target) throw new UserError("Teacher not found.");
  if (target.teacherProfile?.role === "OWNER") throw new UserError("The owner's access can't be turned off.");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: targetId }, data: { status: active ? "ACTIVE" : "DISABLED" } });
    if (!active) await tx.session.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, { actorId, action: active ? "teacher.activate" : "teacher.deactivate", entityType: "user", entityId: targetId });
  });
}

/** Owner only. Creates a one-time reset link for a teacher, for when no phone number is saved. Valid 24 hours. */
export async function issueTeacherResetLink(actorId: string, targetId: string): Promise<string> {
  const actor = await db.teacherProfile.findUnique({ where: { userId: actorId }, select: { role: true } });
  if (actor?.role !== "OWNER") throw new UserError("Only the owner can send a password reset link.");
  const target = await db.user.findFirst({ where: { id: targetId, role: "TEACHER", deletedAt: null }, select: { id: true } });
  if (!target) throw new UserError("Teacher not found.");

  const token = randomToken(32);
  await db.$transaction(async (tx) => {
    // Only the newest link works, so an older link cannot be used after a new one is issued.
    await tx.passwordResetToken.updateMany({ where: { userId: targetId, usedAt: null }, data: { usedAt: new Date() } });
    const reset = await tx.passwordResetToken.create({
      data: { userId: targetId, tokenHash: sha256(token), expiresAt: addHours(new Date(), 24) },
    });
    await audit(tx, { actorId, action: "teacher.reset_link", entityType: "user", entityId: targetId, changes: { resetId: reset.id } });
  });
  return token;
}

export function resetUrl(token: string): string {
  return `${getEnv().APP_URL.replace(/\/$/, "")}/reset#${token}`;
}
