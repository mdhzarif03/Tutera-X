import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { dateOnly, dhakaToday, formatDay, isTime } from "@/lib/dates";
import { queueSms } from "@/lib/sms/service";
import { quoteSend } from "@/lib/sms/pricing";
import { render, templates } from "@/lib/sms/templates";
import { contactsFor, studentFirstPhone } from "@/lib/sms/recipients";
import { num } from "@/lib/money";
import { assertBatchOwned, assertExamOwned } from "./scope";
import { requireNumber, requireText, optionalText, requireId } from "@/lib/validate";

export async function listExams(teacherId: string) {
  return db.exam.findMany({
    where: { teacherId },
    orderBy: { examDate: "desc" },
    select: {
      id: true,
      name: true,
      subject: true,
      examDate: true,
      examTime: true,
      totalMarks: true,
      status: true,
      batches: { select: { batch: { select: { name: true } } } },
      _count: { select: { results: true } },
    },
  });
}

export interface ExamInput {
  name: string;
  subject: string;
  examDate: string;
  examTime: string;
  totalMarks: number;
  passMarks: number | null;
  instructions: string | null;
  batchIds: string[];
}

export function parseExamInput(raw: Record<string, string>, batchIds: string[]): ExamInput {
  const totalMarks = requireNumber(raw.totalMarks, "Total marks", 1, 10_000);
  const passMarks = optionalText(raw.passMarks, 20) === null ? null : requireNumber(raw.passMarks, "Pass marks", 0, totalMarks);
  const examTime = requireText(raw.examTime, "Exam time", 5);
  if (!isTime(examTime)) throw new UserError("Exam time must be HH:MM.");
  return {
    name: requireText(raw.name, "Exam name", 120),
    subject: requireText(raw.subject, "Subject", 60),
    examDate: requireText(raw.examDate, "Exam date", 10),
    examTime,
    totalMarks,
    passMarks,
    instructions: optionalText(raw.instructions, 500),
    batchIds,
  };
}

export async function createExam(teacherId: string, input: ExamInput): Promise<string> {
  if (input.batchIds.length === 0) throw new UserError("Select at least one batch.");
  const day = dateOnly(input.examDate);
  if (input.examDate < dhakaToday()) throw new UserError("The exam date cannot be in the past.");
  for (const id of input.batchIds) await assertBatchOwned(teacherId, requireId(id, "Batch"));

  const members = await db.batchStudent.findMany({
    where: { batchId: { in: input.batchIds }, leftAt: null },
    select: { studentId: true },
  });
  const studentIds = [...new Set(members.map((m) => m.studentId))];
  const contacts = await contactsFor(studentIds);
  const teacher = await db.user.findUniqueOrThrow({ where: { id: teacherId }, select: { name: true } });
  const dateLabel = formatDay(day);

  // Priced before the transaction opens. The sample uses the longest name, so the quote is conservative.
  let longest = "";
  for (const c of contacts.values()) if (c.studentName.length > longest.length) longest = c.studentName;
  const quote = await quoteSend(
    render(templates.examAnnouncement, { student: longest, exam: input.name, date: dateLabel, time: input.examTime, teacher: teacher.name }),
    studentIds.length,
  );

  return db.$transaction(
    async (tx) => {
      const exam = await tx.exam.create({
        data: {
          teacherId,
          name: input.name,
          subject: input.subject,
          examDate: day,
          examTime: input.examTime,
          totalMarks: input.totalMarks,
          passMarks: input.passMarks,
          instructions: input.instructions,
        },
      });
      await tx.examBatch.createMany({ data: input.batchIds.map((batchId) => ({ examId: exam.id, batchId })) });

      const recipients = studentIds.flatMap((sid) => {
        const c = contacts.get(sid);
        if (!c) return [];
        return [
          {
            studentId: sid,
            phone: studentFirstPhone(c),
            body: render(templates.examAnnouncement, {
              student: c.studentName,
              exam: input.name,
              date: dateLabel,
              time: input.examTime,
              teacher: teacher.name,
            }),
          },
        ];
      });
      await queueSms(tx, {
        purpose: "EXAM_ANNOUNCEMENT",
        dedupeKey: `exam-announce:${exam.id}`,
        teacherId,
        template: templates.examAnnouncement,
        recipients,
        allowance: "skip",
        minCredits: quote.creditsPerMessage,
      });
      await audit(tx, { actorId: teacherId, action: "exam.create", entityType: "exam", entityId: exam.id, changes: { batches: input.batchIds.length } });
      return exam.id;
    },
    { timeout: 30_000 },
  );
}

/** Students who should appear on an exam's mark sheet: current members of its batches. */
async function examStudentIds(examId: string): Promise<string[]> {
  const rows = await db.batchStudent.findMany({
    where: { leftAt: null, batch: { examBatches: { some: { examId } } } },
    select: { studentId: true },
  });
  return [...new Set(rows.map((r) => r.studentId))];
}

export async function getExamSheet(teacherId: string, examId: string) {
  const exam = await db.exam.findFirst({
    where: { id: examId, teacherId },
    select: {
      id: true,
      name: true,
      subject: true,
      examDate: true,
      examTime: true,
      totalMarks: true,
      passMarks: true,
      status: true,
      batches: { select: { batch: { select: { id: true, name: true } } } },
    },
  });
  if (!exam) throw new UserError("Exam not found.");

  const studentIds = await examStudentIds(examId);
  const [students, results] = await Promise.all([
    db.studentProfile.findMany({
      where: { userId: { in: studentIds } },
      orderBy: { user: { name: "asc" } },
      select: { userId: true, user: { select: { name: true, username: true } } },
    }),
    db.examResult.findMany({
      where: { examId },
      select: { studentId: true, obtainedMarks: true, isAbsent: true, publishedAt: true, version: true },
    }),
  ]);
  const byStudent = new Map(results.map((r) => [r.studentId, r]));
  return {
    exam,
    rows: students.map((s) => {
      const r = byStudent.get(s.userId);
      return {
        studentId: s.userId,
        name: s.user.name,
        username: s.user.username,
        marks: r && !r.isAbsent ? num(r.obtainedMarks) : null,
        absent: r?.isAbsent ?? false,
        published: Boolean(r?.publishedAt),
      };
    }),
    missing: students.length - results.length,
    publishedCount: results.filter((r) => r.publishedAt).length,
  };
}

export async function saveMarks(
  teacherId: string,
  examId: string,
  entries: { studentId: string; marks: number | null; absent: boolean }[],
): Promise<number> {
  const exam = await assertExamOwned(teacherId, examId);
  if (exam.status === "CANCELLED") throw new UserError("A cancelled exam cannot take marks.");
  const allowed = new Set(await examStudentIds(examId));
  const totalMarks = num(exam.totalMarks);

  const cleaned = entries
    .filter((e) => allowed.has(e.studentId))
    .map((e) => {
      if (e.absent) return { studentId: e.studentId, marks: 0, absent: true };
      if (e.marks === null) return null;
      if (e.marks < 0 || e.marks > totalMarks) {
        throw new UserError(`Marks must be between 0 and ${totalMarks}.`);
      }
      return { studentId: e.studentId, marks: e.marks, absent: false };
    })
    .filter((e): e is { studentId: string; marks: number; absent: boolean } => e !== null);

  return db.$transaction(
    async (tx) => {
      let changed = 0;
      for (const e of cleaned) {
        const existing = await tx.examResult.findUnique({ where: { examId_studentId: { examId, studentId: e.studentId } } });
        if (!existing) {
          await tx.examResult.create({
            data: {
              examId,
              studentId: e.studentId,
              obtainedMarks: e.marks,
              isAbsent: e.absent,
              totalMarksSnapshot: totalMarks,
              enteredById: teacherId,
            },
          });
          changed++;
          continue;
        }
        const same = num(existing.obtainedMarks) === e.marks && existing.isAbsent === e.absent;
        if (same) continue;
        if (existing.publishedAt) {
          await tx.examResultRevision.create({
            data: {
              examResultId: existing.id,
              previousMarks: existing.obtainedMarks,
              newMarks: e.marks,
              changedById: teacherId,
              reason: "Correction after publication",
            },
          });
        }
        await tx.examResult.update({
          where: { id: existing.id },
          data: { obtainedMarks: e.marks, isAbsent: e.absent, enteredById: teacherId, version: { increment: 1 } },
        });
        changed++;
      }
      if (exam.status === "SCHEDULED" && changed > 0) {
        await tx.exam.update({ where: { id: examId }, data: { status: "RESULTS_DRAFT" } });
      }
      await audit(tx, { actorId: teacherId, action: "results.save", entityType: "exam", entityId: examId, changes: { changed } });
      return changed;
    },
    { timeout: 30_000 },
  );
}

/**
 * Publishes results only when every student on the sheet has a mark or an absence entry.
 * Each newly published result queues one notice to the guardian, exactly once.
 */
export async function publishResults(teacherId: string, examId: string): Promise<{ published: number; noticesQueued: number; noticesSkipped: number }> {
  const exam = await assertExamOwned(teacherId, examId);
  if (exam.status === "CANCELLED") throw new UserError("A cancelled exam cannot be published.");

  const studentIds = await examStudentIds(examId);
  const results = await db.examResult.findMany({ where: { examId } });
  const have = new Set(results.map((r) => r.studentId));
  const missing = studentIds.filter((id) => !have.has(id)).length;
  if (missing > 0) {
    throw new UserError(`Enter marks or mark absence for all students before publishing. ${missing} still missing.`);
  }
  if (results.length === 0) throw new UserError("There are no results to publish.");

  const toPublish = results.filter((r) => !r.publishedAt);
  const contacts = await contactsFor(toPublish.map((r) => r.studentId));
  const teacher = await db.user.findUniqueOrThrow({ where: { id: teacherId }, select: { name: true } });
  const total = num(exam.totalMarks);

  return db.$transaction(
    async (tx) => {
      const now = new Date();
      let noticesQueued = 0;
      let noticesSkipped = 0;
      for (const r of toPublish) {
        await tx.examResult.update({ where: { id: r.id }, data: { publishedAt: now } });
        const c = contacts.get(r.studentId);
        if (!c) continue;
        const body = r.isAbsent
          ? render(templates.resultAbsent, { student: c.studentName, exam: exam.name, teacher: teacher.name })
          : render(templates.resultPublished, {
              student: c.studentName,
              marks: num(r.obtainedMarks),
              total,
              exam: exam.name,
              teacher: teacher.name,
            });
        const res = await queueSms(tx, {
          purpose: "RESULT_PUBLISHED",
          dedupeKey: `result:${r.id}`,
          teacherId,
          template: templates.resultPublished,
          recipients: [{ studentId: r.studentId, phone: c.guardianPhone, body }],
          allowance: "skip",
        });
        noticesQueued += res.queued;
        noticesSkipped += res.skipped;
      }
      await tx.exam.update({ where: { id: examId }, data: { status: "RESULTS_PUBLISHED", resultsPublishedAt: now } });
      await audit(tx, { actorId: teacherId, action: "results.publish", entityType: "exam", entityId: examId, changes: { published: toPublish.length } });
      return { published: toPublish.length, noticesQueued, noticesSkipped };
    },
    { timeout: 60_000 },
  );
}

