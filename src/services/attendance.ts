import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { dateOnly, dayKey, dhakaToday, formatDay } from "@/lib/dates";
import { queueSms } from "@/lib/sms/service";
import { render, templates } from "@/lib/sms/templates";
import { contactsFor } from "@/lib/sms/recipients";
import { assertBatchOwned } from "./scope";
import type { AttendanceStatus } from "@prisma/client";

const STATUSES: readonly AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

export function parseStatus(value: unknown): AttendanceStatus {
  if (typeof value === "string" && (STATUSES as readonly string[]).includes(value)) return value as AttendanceStatus;
  throw new UserError("Choose a valid attendance status.");
}

/** Current members of a batch, with the status recorded for the chosen date (if any). */
export async function getRoster(teacherId: string, batchId: string, date: string) {
  const batch = await assertBatchOwned(teacherId, batchId);
  const day = dateOnly(date);
  const members = await db.batchStudent.findMany({
    where: { batchId, leftAt: null },
    orderBy: { student: { user: { name: "asc" } } },
    select: { studentId: true, student: { select: { user: { select: { name: true, username: true } } } } },
  });
  const records = await db.attendance.findMany({
    where: { batchId, date: day, studentId: { in: members.map((m) => m.studentId) } },
    select: { studentId: true, status: true },
  });
  const byStudent = new Map(records.map((r) => [r.studentId, r.status]));
  return {
    batch,
    date,
    rows: members.map((m) => ({
      studentId: m.studentId,
      name: m.student.user.name,
      username: m.student.user.username,
      status: byStudent.get(m.studentId) ?? null,
    })),
  };
}

/**
 * Commits attendance for a batch and date in one transaction. Unchanged records are left alone.
 * A new absence (or a changed one that has no notice yet) queues exactly one absence message.
 */
export async function saveAttendance(
  teacherId: string,
  batchId: string,
  date: string,
  entries: { studentId: string; status: AttendanceStatus }[],
): Promise<{ saved: number; noticesQueued: number; noticesSkipped: number }> {
  const batch = await assertBatchOwned(teacherId, batchId);
  const day = dateOnly(date);
  if (dayKey(day) > dhakaToday()) throw new UserError("Attendance cannot be recorded for a future date.");

  const members = await db.batchStudent.findMany({
    where: { batchId, leftAt: null },
    select: { studentId: true },
  });
  const allowed = new Set(members.map((m) => m.studentId));
  const valid = entries.filter((e) => allowed.has(e.studentId));
  if (valid.length === 0) throw new UserError("No students in this batch were selected.");

  const teacher = await db.user.findUniqueOrThrow({ where: { id: teacherId }, select: { name: true } });
  const profile = await db.teacherProfile.findUniqueOrThrow({ where: { userId: teacherId }, select: { absenceSmsEnabled: true } });
  const contacts = await contactsFor(valid.map((e) => e.studentId));
  const dateLabel = formatDay(day);

  return db.$transaction(
    async (tx) => {
      let saved = 0;
      let noticesQueued = 0;
      let noticesSkipped = 0;
      for (const entry of valid) {
        const key = { batchId_studentId_date: { batchId, studentId: entry.studentId, date: day } };
        const existing = await tx.attendance.findUnique({ where: key });

        let record;
        if (!existing) {
          record = await tx.attendance.create({
            data: { batchId, studentId: entry.studentId, date: day, status: entry.status, markedById: teacherId },
          });
          saved++;
        } else if (existing.status !== entry.status) {
          await tx.attendanceChangeLog.create({
            data: { attendanceId: existing.id, previousStatus: existing.status, newStatus: entry.status, changedById: teacherId },
          });
          record = await tx.attendance.update({
            where: { id: existing.id },
            data: { status: entry.status, markedById: teacherId, version: { increment: 1 } },
          });
          saved++;
        } else {
          record = existing;
        }

        // Absence notice: one per attendance record, never re-sent when a record is edited again.
        if (record.status === "ABSENT" && profile.absenceSmsEnabled) {
          const c = contacts.get(entry.studentId);
          if (c) {
            const body = render(templates.absence, {
              student: c.studentName,
              batch: batch.name,
              date: dateLabel,
              teacher: teacher.name,
            });
            // Automatic notices never block attendance: over-allowance notices are recorded as skipped.
            const result = await queueSms(tx, {
              purpose: "ABSENCE_NOTICE",
              dedupeKey: `absence:${record.id}`,
              teacherId,
              template: templates.absence,
              recipients: [{ studentId: entry.studentId, phone: c.guardianPhone, body }],
              allowance: "skip",
            });
            noticesQueued += result.queued;
            noticesSkipped += result.skipped;
          }
        }
      }
      await audit(tx, {
        actorId: teacherId,
        action: "attendance.commit",
        entityType: "batch",
        entityId: batchId,
        changes: { date, count: saved },
      });
      return { saved, noticesQueued, noticesSkipped };
    },
    { timeout: 30_000 },
  );
}

export async function markAllPresent(teacherId: string, batchId: string, date: string) {
  const roster = await getRoster(teacherId, batchId, date);
  return saveAttendance(
    teacherId,
    batchId,
    date,
    roster.rows.map((r) => ({ studentId: r.studentId, status: "PRESENT" as const })),
  );
}

/** Attendance for one student, for dashboards. Excused days are excluded from the percentage. */
export async function attendanceSummary(studentId: string, batchFilter?: { teacherId: string }) {
  const rows = await db.attendance.findMany({
    where: { studentId, ...(batchFilter ? { batch: { teacherId: batchFilter.teacherId } } : {}) },
    orderBy: { date: "desc" },
    select: { date: true, status: true, batch: { select: { name: true } } },
  });
  const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0 };
  for (const r of rows) counts[r.status]++;
  const attended = counts.PRESENT + counts.LATE;
  const countable = attended + counts.ABSENT;
  return {
    rows,
    counts,
    percentage: countable === 0 ? null : Math.round((attended / countable) * 1000) / 10,
  };
}

