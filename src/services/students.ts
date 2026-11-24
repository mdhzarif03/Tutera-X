import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { UserError, isUniqueViolation } from "@/lib/errors";
import { normalizeBdPhone } from "@/lib/phone";
import { randomToken, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { getEnv } from "@/lib/env";
import { addHours } from "@/lib/dates";
import { queueSms } from "@/lib/sms/service";
import { render, templates } from "@/lib/sms/templates";
import { optionalText, requireNumber, requireText } from "@/lib/validate";
import { randomUsernameNumber, usernameCandidate, usernameInitials } from "@/lib/usernames";
import { checkClassFields } from "@/lib/student-options";
import { assertBatchOwned, assertStudentOfTeacher } from "./scope";
import { balancesFor } from "./payments";
import type { Prisma } from "@prisma/client";

export const PAGE_SIZE = 25;

export interface StudentInput {
  name: string;
  guardianPhone: string;
  className: string;
  version: string;
  studentGroup: string | null;
  institution: string;
  monthlyFee: number;
  batchId: string | null;
}

export function parseStudentInput(raw: Record<string, string>): StudentInput {
  const classFields = (() => {
    try {
      return checkClassFields({ className: raw.className ?? "", version: raw.version ?? "", studentGroup: raw.studentGroup ?? "" });
    } catch (err) {
      throw new UserError(err instanceof Error ? err.message : "Check the class details.");
    }
  })();
  return {
    name: requireText(raw.name, "Student name", 120),
    guardianPhone: normalizeBdPhone(requireText(raw.guardianPhone, "Parent or guardian phone", 20)),
    className: classFields.className,
    version: classFields.version,
    studentGroup: classFields.studentGroup,
    institution: requireText(raw.institution, "School or institute", 120),
    monthlyFee: requireNumber(raw.monthlyFee, "Monthly fee", 0, 1_000_000),
    batchId: optionalText(raw.batchId, 64),
  };
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
  const token = randomToken(32);
  const initials = usernameInitials(input.name);

  for (let attempt = 0; attempt < 10; attempt++) {
    const number = randomUsernameNumber();
    const username = usernameCandidate(initials, number);

    try {
      const created = await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(${BigInt(number)})`;
          const usedNumber = await tx.user.findFirst({
            where: { username: { endsWith: `-${number}` } },
            select: { id: true },
          });
          if (usedNumber) return false;

          const body = render(templates.studentActivation, { student: input.name, username, link: activationLink(token) });
          const guardian = await tx.guardian.upsert({
            where: { phoneE164: input.guardianPhone },
            update: {},
            create: { phoneE164: input.guardianPhone, name: "Guardian" },
          });
          await tx.user.create({
            data: {
              id: studentId,
              role: "STUDENT",
              username,
              name: input.name,
              status: "PENDING_ACTIVATION",
            },
          });
          await tx.studentProfile.create({
            data: {
              userId: studentId,
              className: input.className,
              institution: input.institution,
              version: input.version,
              studentGroup: input.studentGroup,
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
            recipients: [{ studentId, phone: input.guardianPhone, body }],
          });
          await audit(tx, {
            actorId: teacherId,
            action: "student.create",
            entityType: "student",
            entityId: studentId,
            changes: { className: input.className, batchId: input.batchId },
          });
          return true;
        },
        { timeout: 20_000 },
      );
      if (created) return { studentId, username };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const usernameTaken = await db.user.findUnique({ where: { username }, select: { id: true } });
      if (!usernameTaken) throw new UserError("This phone number is already in use.");
    }
  }
  throw new UserError("Could not allocate a unique login ID. Please try again.");
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
              { guardian: { phoneE164: { contains: q } } },
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
            guardian: { select: { phoneE164: true } },
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
        studentGroup: true,
        monthlyFee: true,
        archivedAt: true,
        user: { select: { name: true, username: true, status: true } },
        guardian: {
          select: {
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
          create: { phoneE164: input.guardianPhone, name: "Guardian" },
        });
        guardianId = g.id;
      }

      await tx.user.update({ where: { id: studentId }, data: { name: input.name } });
      await tx.studentProfile.update({
        where: { userId: studentId },
        data: {
          className: input.className,
          institution: input.institution,
          version: input.version,
          studentGroup: input.studentGroup,
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
    select: { status: true, name: true, username: true, studentProfile: { select: { guardian: { select: { phoneE164: true } } } } },
  });
  if (user.status !== "PENDING_ACTIVATION") throw new UserError("This student has already joined.");
  if (!user.username) throw new UserError("This account has no login ID.");
  const phone = user.studentProfile?.guardian.phoneE164;
  if (!phone) throw new UserError("There's no parent phone number saved for this student.");

  const token = randomToken(32);
  const body = render(templates.studentActivation, { student: user.name, username: user.username, link: activationLink(token) });

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


/**
 * Deletes a student when nothing depends on them. If they have attendance, fees, results, payments
 * or a parent login, they are archived instead, so no history is lost. A student shared with another
 * teacher is removed only from this teacher's classes.
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
