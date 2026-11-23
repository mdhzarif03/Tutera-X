import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { dateOnly, dhakaToday, addDays } from "@/lib/dates";
import { num } from "@/lib/money";
import { balancesFor } from "./payments";
import { attendanceSummary } from "./attendance";
import { getSmsBalance, listSmsHistory } from "./comms";
import { allowanceSummary } from "@/lib/sms/allowance";

export async function teacherOverview(teacherId: string) {
  const today = dateOnly(dhakaToday());
  const in14 = addDays(today, 14);
  const [activeStudents, activeBatches, todayAttendance, upcomingExams, recentPayments, recentMessages, links, sms, allowance] = await Promise.all([
    db.teacherStudent.count({ where: { teacherId, student: { archivedAt: null } } }),
    db.batch.count({ where: { teacherId, archivedAt: null } }),
    db.attendance.groupBy({
      by: ["status"],
      where: { date: today, batch: { teacherId } },
      _count: { _all: true },
    }),
    db.exam.findMany({
      where: { teacherId, examDate: { gte: today, lte: in14 }, status: { not: "CANCELLED" } },
      orderBy: { examDate: "asc" },
      take: 5,
      select: { id: true, name: true, subject: true, examDate: true, examTime: true },
    }),
    db.payment.findMany({
      where: { recordedById: teacherId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, amount: true, method: true, paidOn: true, student: { select: { user: { select: { name: true } } } } },
    }),
    listSmsHistory(teacherId, 5),
    db.teacherStudent.findMany({
      where: { teacherId, student: { archivedAt: null } },
      select: { studentId: true },
    }),
    getSmsBalance(),
    allowanceSummary(teacherId),
  ]);

  const balances = await balancesFor(links.map((l) => l.studentId));
  const outstanding = [...balances.values()].reduce((sum, b) => sum + Math.max(0, b.balance), 0);
  const counts: Record<string, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  for (const row of todayAttendance) counts[row.status] = row._count._all;

  return { activeStudents, activeBatches, todayCounts: counts, upcomingExams, recentPayments, recentMessages, outstanding, sms, allowance };
}

/** One student's dashboard. Used by the student themselves and by the linked parent (read-only). */
export async function studentDashboard(studentId: string) {
  const profile = await db.studentProfile.findUnique({
    where: { userId: studentId },
    select: {
      userId: true,
      className: true,
      institution: true,
      version: true,
      monthlyFee: true,
      user: { select: { name: true, username: true, phoneE164: true } },
      guardian: { select: { name: true, phoneE164: true } },
    },
  });
  if (!profile) throw new UserError("Student profile not found.");

  const memberships = await db.batchStudent.findMany({
    where: { studentId, leftAt: null },
    select: { batch: { select: { id: true, name: true, subject: true, teacher: { select: { user: { select: { name: true } } } } } } },
  });
  const batchIds = memberships.map((m) => m.batch.id);
  const today = dateOnly(dhakaToday());

  const [attendance, results, upcoming, payments, balances] = await Promise.all([
    attendanceSummary(studentId),
    db.examResult.findMany({
      where: { studentId, publishedAt: { not: null } },
      orderBy: { exam: { examDate: "asc" } },
      select: {
        obtainedMarks: true,
        isAbsent: true,
        totalMarksSnapshot: true,
        exam: { select: { id: true, name: true, subject: true, examDate: true, passMarks: true } },
      },
    }),
    db.exam.findMany({
      where: { status: { in: ["SCHEDULED", "RESULTS_DRAFT"] }, examDate: { gte: today }, batches: { some: { batchId: { in: batchIds } } } },
      orderBy: { examDate: "asc" },
      take: 10,
      select: { id: true, name: true, subject: true, examDate: true, examTime: true },
    }),
    db.payment.findMany({
      where: { studentId },
      orderBy: { paidOn: "desc" },
      take: 20,
      select: { id: true, amount: true, method: true, paidOn: true, forPeriod: true },
    }),
    balancesFor([studentId]),
  ]);

  const performance = results.map((r) => {
    const total = num(r.totalMarksSnapshot);
    const obtained = r.isAbsent ? 0 : num(r.obtainedMarks);
    return {
      examId: r.exam.id,
      name: r.exam.name,
      subject: r.exam.subject,
      examDate: r.exam.examDate,
      obtained,
      total,
      absent: r.isAbsent,
      percentage: total > 0 ? Math.round((obtained / total) * 1000) / 10 : 0,
    };
  });

  return {
    profile,
    batches: memberships.map((m) => m.batch),
    attendance,
    performance,
    upcoming,
    payments,
    balance: balances.get(studentId) ?? null,
  };
}

export async function parentChildren(parentUserId: string) {
  const parent = await db.parentProfile.findUnique({
    where: { userId: parentUserId },
    select: { guardianId: true, guardian: { select: { name: true, phoneE164: true } } },
  });
  if (!parent) throw new UserError("Parent profile not found.");
  const children = await db.studentProfile.findMany({
    where: { guardianId: parent.guardianId, archivedAt: null },
    orderBy: { user: { name: "asc" } },
    select: { userId: true, className: true, institution: true, user: { select: { name: true, username: true } } },
  });
  return { guardian: parent.guardian, children };
}
