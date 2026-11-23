import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { UserError, isUniqueViolation } from "@/lib/errors";
import { normalizeBdPhone } from "@/lib/phone";
import { randomDigits, randomToken, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { addHours } from "@/lib/dates";
import { queueSms } from "@/lib/sms/service";
import { render, templates } from "@/lib/sms/templates";
import { optionalText, requireNumber, requireText } from "@/lib/validate";
import { assertBatchOwned, assertStudentOfTeacher } from "./scope";
import { balancesFor } from "./payments";
import { settleRecipientCredits } from "@/lib/sms/allowance";
import type { Prisma } from "@prisma/client";

export const PAGE_SIZE = 25;

export interface StudentInput {
  name: string;
  phone: string | null;
  guardianName: string;
  guardianPhone: string;
  className: string;
  institution: string;
  version: string;
  monthlyFee: number;
  batchId: string | null;
}

export function parseStudentInput(raw: Record<string, string>): StudentInput {
  const phoneRaw = optionalText(raw.phone, 20);
  return {
    name: requireText(raw.name, "Student name", 120),
    phone: phoneRaw ? normalizeBdPhone(phoneRaw) : null,
    guardianName: requireText(raw.guardianName, "Guardian name", 120),
    guardianPhone: normalizeBdPhone(requireText(raw.guardianPhone, "Guardian phone", 20)),
    className: requireText(raw.className, "Class", 40),
    institution: requireText(raw.institution, "Institution", 120),
    version: requireText(raw.version, "Version", 40),
    monthlyFee: requireNumber(raw.monthlyFee, "Monthly tuition", 0, 1_000_000),
    batchId: optionalText(raw.batchId, 64),
  };
}

async function nextUsername(prefix: "S" | "P"): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const candidate = `${prefix}${randomDigits(6)}`;
    const taken = await db.user.findUnique({ where: { username: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw new UserError("Could not allocate a username. Please try again.");
}

function activationLink(token: string): string {
  // Fragment, not path: the token never reaches request logs. See components/account-token-exchange.tsx.
  return `${getEnv().APP_URL.replace(/\/$/, "")}/activate#${token}`;
}

export async function createStudent(teacherId: string, input: StudentInput): Promise<{ studentId: string; username: string }> {
  const duplicate = await db.studentProfile.findFirst({
    where: {
      archivedAt: null,
      guardian: { phoneE164: input.guardianPhone },
      user: { name: { equals: input.name, mode: "insensitive" } },
      teachers: { some: { teacherId } },
    },
    select: { userId: true },
  });
  if (duplicate) {
    throw new UserError("This student is already saved. Add them to the batch instead.");
  }
  if (input.batchId) await assertBatchOwned(teacherId, input.batchId);

  const studentId = randomUUID();
  const username = await nextUsername("S");
  const token = randomToken(32);
  const body = render(templates.studentActivation, { name: input.name, username, link: activationLink(token) });

  try {
    await db.$transaction(
      async (tx) => {
        const guardian = await tx.guardian.upsert({
          where: { phoneE164: input.guardianPhone },
          update: {},
          create: { phoneE164: input.guardianPhone, name: input.guardianName },
        });
        await tx.user.create({
          data: {
            id: studentId,
            role: "STUDENT",
            username,
            name: input.name,
            phoneE164: input.phone,
            status: "PENDING_ACTIVATION",
          },
        });
        await tx.studentProfile.create({
          data: {
            userId: studentId,
            className: input.className,
            institution: input.institution,
            version: input.version,
            monthlyFee: input.monthlyFee,
            guardianId: guardian.id,
          },
        });
        await tx.teacherStudent.create({ data: { teacherId, studentId } });
        if (input.batchId) await tx.batchStudent.create({ data: { batchId: input.batchId, studentId } });

        const activation = await tx.studentActivation.create({
          data: { userId: studentId, tokenHash: sha256(token), expiresAt: addHours(new Date(), 72) },
        });
        await queueSms(tx, {
          purpose: "ACCOUNT_ACTIVATION",
          dedupeKey: `activation:${activation.id}`,
          teacherId,
          template: templates.studentActivation,
          recipients: [{ studentId, phone: input.phone ?? input.guardianPhone, body }],
        });
        await audit(tx, {
          actorId: teacherId,
          action: "student.create",
          entityType: "student",
          entityId: studentId,
          changes: { className: input.className, batchId: input.batchId },
        });
      },
      { timeout: 20_000 },
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("This phone number is already in use.");
    throw err;
  }
  return { studentId, username };
}

export async function listStudents(
  teacherId: string,
  opts: { q: string; page: number; archived: boolean },
) {
  const q = opts.q.trim();
  const where: Prisma.TeacherStudentWhereInput = {
    teacherId,
    student: {
      archivedAt: opts.archived ? { not: null } : null,
      ...(q
        ? {
            OR: [
              { user: { name: { contains: q, mode: "insensitive" } } },
              { user: { username: { contains: q.toUpperCase() } } },
              { guardian: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
  };
  const [rows, total] = await Promise.all([
    db.teacherStudent.findMany({
      where,
      orderBy: { student: { user: { name: "asc" } } },
      skip: (opts.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        student: {
          select: {
            userId: true,
            className: true,
            institution: true,
            version: true,
            monthlyFee: true,
            user: { select: { name: true, username: true, status: true } },
            guardian: { select: { name: true, phoneE164: true } },
            batchMemberships: {
              where: { leftAt: null },
              select: { batch: { select: { name: true } } },
            },
          },
        },
      },
    }),
    db.teacherStudent.count({ where }),
  ]);
  return { rows, total, page: opts.page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getStudentDetail(teacherId: string, studentId: string) {
  await assertStudentOfTeacher(teacherId, studentId);

  const [student, memberships, attendance, results, recentSms, balances] = await Promise.all([
    db.studentProfile.findUniqueOrThrow({
      where: { userId: studentId },
      select: {
        userId: true,
        className: true,
        institution: true,
        version: true,
        monthlyFee: true,
        archivedAt: true,
        user: { select: { name: true, username: true, status: true, phoneE164: true } },
        guardian: {
          select: {
            name: true,
            phoneE164: true,
            parentUser: { select: { user: { select: { username: true, status: true } } } },
          },
        },
      },
    }),
    db.batchStudent.findMany({
      where: { studentId, batch: { teacherId } },
      orderBy: { joinedAt: "desc" },
      select: { leftAt: true, batch: { select: { id: true, name: true, archivedAt: true } } },
    }),
    db.attendance.findMany({
      where: { studentId, batch: { teacherId } },
      orderBy: { date: "desc" },
      take: 60,
      select: { date: true, status: true, batch: { select: { name: true } } },
    }),
    db.examResult.findMany({
      where: { studentId, exam: { teacherId } },
      orderBy: { exam: { examDate: "desc" } },
      select: {
        obtainedMarks: true,
        isAbsent: true,
        totalMarksSnapshot: true,
        publishedAt: true,
        exam: { select: { id: true, name: true, subject: true, examDate: true } },
      },
    }),
    db.smsRecipient.findMany({
      where: { studentId, smsMessage: { teacherId } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { status: true, deliveryStatus: true, createdAt: true, phoneE164: true, smsMessage: { select: { purpose: true } } },
    }),
    balancesFor([studentId]),
  ]);

  return { student, memberships, attendance, results, recentSms, balance: balances.get(studentId) ?? null };
}

export async function updateStudent(teacherId: string, studentId: string, input: StudentInput): Promise<void> {
  await assertStudentOfTeacher(teacherId, studentId);
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.studentProfile.findUniqueOrThrow({
        where: { userId: studentId },
        select: { guardianId: true, guardian: { select: { phoneE164: true } } },
      });

      let guardianId = current.guardianId;
      if (input.guardianPhone !== current.guardian.phoneE164) {
        const g = await tx.guardian.upsert({
          where: { phoneE164: input.guardianPhone },
          update: {},
          create: { phoneE164: input.guardianPhone, name: input.guardianName },
        });
        guardianId = g.id;
      } else {
        await tx.guardian.update({ where: { id: current.guardianId }, data: { name: input.guardianName } });
      }

      await tx.user.update({ where: { id: studentId }, data: { name: input.name, phoneE164: input.phone } });
      await tx.studentProfile.update({
        where: { userId: studentId },
        data: {
          className: input.className,
          institution: input.institution,
          version: input.version,
          monthlyFee: input.monthlyFee,
          guardianId,
        },
      });
      await audit(tx, { actorId: teacherId, action: "student.update", entityType: "student", entityId: studentId, changes: { className: input.className, monthlyFee: input.monthlyFee } });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("This phone number is already in use.");
    throw err;
  }
}

export async function setStudentArchived(teacherId: string, studentId: string, archived: boolean): Promise<void> {
  await assertStudentOfTeacher(teacherId, studentId);
  await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: studentId }, select: { passwordHash: true } });
    await tx.studentProfile.update({ where: { userId: studentId }, data: { archivedAt: archived ? new Date() : null } });
    await tx.user.update({
      where: { id: studentId },
      data: { status: archived ? "DISABLED" : user.passwordHash ? "ACTIVE" : "PENDING_ACTIVATION" },
    });
    await audit(tx, { actorId: teacherId, action: archived ? "student.archive" : "student.restore", entityType: "student", entityId: studentId });
  });
}

export async function resendActivation(teacherId: string, studentId: string): Promise<void> {
  await assertStudentOfTeacher(teacherId, studentId);
  const user = await db.user.findUniqueOrThrow({
    where: { id: studentId },
    select: { status: true, name: true, username: true, phoneE164: true, studentProfile: { select: { guardian: { select: { phoneE164: true } } } } },
  });
  if (user.status !== "PENDING_ACTIVATION") throw new UserError("This student has already joined.");
  if (!user.username) throw new UserError("This account has no login ID.");

  const token = randomToken(32);
  const body = render(templates.studentActivation, { name: user.name, username: user.username, link: activationLink(token) });
  const phone = user.phoneE164 ?? user.studentProfile?.guardian.phoneE164;
  if (!phone) throw new UserError("There's no phone number saved for this student.");

  await db.$transaction(async (tx) => {
    await tx.studentActivation.updateMany({ where: { userId: studentId, usedAt: null }, data: { usedAt: new Date() } });
    const activation = await tx.studentActivation.create({
      data: { userId: studentId, tokenHash: sha256(token), expiresAt: addHours(new Date(), 72) },
    });
    await queueSms(tx, {
      purpose: "ACCOUNT_ACTIVATION",
      dedupeKey: `activation:${activation.id}`,
      teacherId,
      template: templates.studentActivation,
      recipients: [{ studentId, phone, body }],
    });
    await audit(tx, { actorId: teacherId, action: "student.activation_resent", entityType: "student", entityId: studentId });
  });
}

export async function createParentLogin(teacherId: string, studentId: string): Promise<{ username: string }> {
  await assertStudentOfTeacher(teacherId, studentId);
  const s = await db.studentProfile.findUniqueOrThrow({
    where: { userId: studentId },
    select: { guardian: { select: { id: true, name: true, phoneE164: true, parentUser: { select: { userId: true } } } } },
  });
  if (s.guardian.parentUser) throw new UserError("This parent already has an account.");

  const userId = randomUUID();
  const username = await nextUsername("P");
  const token = randomToken(32);
  const body = render(templates.parentActivation, { name: s.guardian.name, username, link: activationLink(token) });

  try {
    await db.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          role: "PARENT",
          username,
          name: s.guardian.name,
          phoneE164: s.guardian.phoneE164,
          status: "PENDING_ACTIVATION",
        },
      });
      await tx.parentProfile.create({ data: { userId, guardianId: s.guardian.id } });
      const activation = await tx.studentActivation.create({
        data: { userId, tokenHash: sha256(token), expiresAt: addHours(new Date(), 72) },
      });
      await queueSms(tx, {
        purpose: "ACCOUNT_ACTIVATION",
        dedupeKey: `activation:${activation.id}`,
        teacherId,
        template: templates.parentActivation,
        recipients: [{ studentId, phone: s.guardian.phoneE164, body }],
      });
      await audit(tx, { actorId: teacherId, action: "parent.create", entityType: "parent", entityId: userId, changes: { studentId } });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("This parent's phone number is already in use.");
    throw err;
  }
  return { username };
}

/**
 * Deletes a student when nothing depends on them. If they have attendance, fees, results, payments
 * or a parent login, they are archived instead, so no history is lost. A student shared with another
 * teacher is removed only from this teacher's classes. Queued messages release their allowance first.
 */
export async function deleteStudent(teacherId: string, studentId: string): Promise<string> {
  await assertStudentOfTeacher(teacherId, studentId);

  const [attendance, results, charges, payments, adjustments, profile, otherTeachers] = await Promise.all([
    db.attendance.count({ where: { studentId } }),
    db.examResult.count({ where: { studentId } }),
    db.feeCharge.count({ where: { studentId } }),
    db.payment.count({ where: { studentId } }),
    db.paymentAdjustment.count({ where: { studentId } }),
    db.studentProfile.findUniqueOrThrow({
      where: { userId: studentId },
      select: { guardian: { select: { parentUser: { select: { userId: true } } } } },
    }),
    db.teacherStudent.count({ where: { studentId, teacherId: { not: teacherId } } }),
  ]);
  const hasRecords = attendance + results + charges + payments + adjustments > 0 || Boolean(profile.guardian.parentUser);

  if (hasRecords) {
    await setStudentArchived(teacherId, studentId, true);
    return "This student has records, so we archived them instead. Nothing has been lost.";
  }

  const permanent = otherTeachers === 0;
  await db.$transaction(async (tx) => {
    if (permanent) {
      // Release any allowance still held by queued messages to this student, so it cannot leak.
      const held = await tx.smsRecipient.findMany({ where: { studentId, reservedCredits: { gt: 0 } }, select: { id: true } });
      for (const r of held) await settleRecipientCredits(tx, r.id, null);

      await tx.batchStudent.deleteMany({ where: { studentId } });
      await tx.teacherStudent.deleteMany({ where: { studentId } });
      await tx.smsDeliveryAttempt.deleteMany({ where: { smsRecipient: { studentId } } });
      await tx.smsRecipient.deleteMany({ where: { studentId } });
      await tx.studentProfile.delete({ where: { userId: studentId } });
      await tx.user.delete({ where: { id: studentId } });
    } else {
      await tx.batchStudent.deleteMany({ where: { studentId, batch: { teacherId } } });
      await tx.teacherStudent.deleteMany({ where: { studentId, teacherId } });
    }
    await audit(tx, { actorId: teacherId, action: "student.delete", entityType: "student", entityId: studentId, changes: { permanent } });
  });
  return permanent
    ? "Student deleted."
    : "Removed from your classes. Other teachers still have this student.";
}
