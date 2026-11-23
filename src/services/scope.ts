import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";

// Every teacher-facing operation calls one of these first. A record outside the teacher's scope
// returns the same "not found" as a missing record, so IDs cannot be probed.

export async function assertStudentOfTeacher(teacherId: string, studentId: string): Promise<void> {
  const link = await db.teacherStudent.findUnique({
    where: { teacherId_studentId: { teacherId, studentId } },
    select: { studentId: true },
  });
  if (!link) throw new UserError("Student not found.");
}

export async function assertBatchOwned(teacherId: string, batchId: string) {
  const batch = await db.batch.findFirst({
    where: { id: batchId, teacherId },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!batch) throw new UserError("Batch not found.");
  return batch;
}

export async function assertExamOwned(teacherId: string, examId: string) {
  const exam = await db.exam.findFirst({ where: { id: examId, teacherId } });
  if (!exam) throw new UserError("Exam not found.");
  return exam;
}

/** Students this teacher manages and that are not archived. */
export function currentStudentWhere(teacherId: string) {
  return { teacherId, student: { archivedAt: null } };
}
