"use server";

import { redirect } from "next/navigation";
import type { PaymentMethod } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { runAction } from "@/lib/action";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { fields, fieldsWithPrefix, str, strs } from "@/lib/form";
import { requireId, requireNumber, requireText } from "@/lib/validate";
import { UserError } from "@/lib/errors";
import * as students from "@/services/students";
import * as batches from "@/services/batches";
import * as attendance from "@/services/attendance";
import * as exams from "@/services/exams";
import * as payments from "@/services/payments";
import * as comms from "@/services/comms";
import * as teachers from "@/services/teachers";
import { refreshSmsBalance } from "@/services/comms";
import { providerMode } from "@/lib/sms/nishchit";
import { adjustAllowance } from "@/lib/sms/allowance";
import { parseCreditAmount } from "@/lib/sms/allowance-math";
import { clearInviteRevealCookie, setInviteRevealCookie } from "@/lib/auth/one-time";

async function teacher() {
  return requireRole("TEACHER");
}

// ---- Students ----

export async function createStudentAction(formData: FormData): Promise<void> {
  const t = await teacher();
  return runAction("/teacher/students/new", async () => {
    const input = students.parseStudentInput(fields(formData));
    const r = await students.createStudent(t.id, input);
    return {
      message: `Student added. Login username: ${r.username}. Activation SMS queued.`,
      redirectTo: `/teacher/students/${r.studentId}`,
    };
  });
}

export async function updateStudentAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const studentId = requireId(str(formData, "studentId"), "Student");
  return runAction(`/teacher/students/${studentId}`, async () => {
    const input = students.parseStudentInput({ ...fields(formData), batchId: "" });
    await students.updateStudent(t.id, studentId, input);
    return { message: "Student details saved." };
  });
}

export async function setStudentArchivedAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const studentId = requireId(str(formData, "studentId"), "Student");
  const archived = str(formData, "archived") === "1";
  return runAction(`/teacher/students/${studentId}`, async () => {
    await students.setStudentArchived(t.id, studentId, archived);
    return { message: archived ? "Student archived. Their history is kept." : "Student restored." };
  });
}

export async function resendActivationAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const studentId = requireId(str(formData, "studentId"), "Student");
  return runAction(`/teacher/students/${studentId}`, async () => {
    await students.resendActivation(t.id, studentId);
    return { message: "A new activation link has been sent. The previous link no longer works." };
  });
}

export async function createParentLoginAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const studentId = requireId(str(formData, "studentId"), "Student");
  return runAction(`/teacher/students/${studentId}`, async () => {
    const r = await students.createParentLogin(t.id, studentId);
    return { message: `Parent login created. Username: ${r.username}. Activation SMS queued.` };
  });
}

export async function addAdjustmentAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const studentId = requireId(str(formData, "studentId"), "Student");
  return runAction(`/teacher/students/${studentId}`, async () => {
    await payments.addAdjustment(t.id, studentId, fields(formData));
    return { message: "Adjustment recorded." };
  });
}

// ---- Batches ----

export async function createBatchAction(formData: FormData): Promise<void> {
  const t = await teacher();
  return runAction("/teacher/batches", async () => {
    const id = await batches.createBatch(t.id, fields(formData));
    return { message: "Batch created.", redirectTo: `/teacher/batches/${id}` };
  });
}

export async function updateBatchAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const batchId = requireId(str(formData, "batchId"), "Batch");
  return runAction(`/teacher/batches/${batchId}`, async () => {
    await batches.updateBatch(t.id, batchId, fields(formData));
    return { message: "Batch updated." };
  });
}

export async function setBatchArchivedAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const batchId = requireId(str(formData, "batchId"), "Batch");
  const archived = str(formData, "archived") === "1";
  return runAction(`/teacher/batches/${batchId}`, async () => {
    await batches.setBatchArchived(t.id, batchId, archived);
    return { message: archived ? "Batch archived." : "Batch restored." };
  });
}

export async function addStudentsToBatchAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const batchId = requireId(str(formData, "batchId"), "Batch");
  return runAction(`/teacher/batches/${batchId}`, async () => {
    const added = await batches.addStudentsToBatch(t.id, batchId, strs(formData, "studentIds"));
    return { message: `${added} student${added === 1 ? "" : "s"} added to the batch.` };
  });
}

export async function removeFromBatchAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const batchId = requireId(str(formData, "batchId"), "Batch");
  const studentId = requireId(str(formData, "studentId"), "Student");
  return runAction(`/teacher/batches/${batchId}`, async () => {
    await batches.removeStudentFromBatch(t.id, batchId, studentId);
    return { message: "Student removed from the batch. Their history is kept." };
  });
}

export async function addScheduleAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const batchId = requireId(str(formData, "batchId"), "Batch");
  return runAction(`/teacher/batches/${batchId}`, async () => {
    await batches.addSchedule(t.id, batchId, fields(formData));
    return { message: "Class time added." };
  });
}

export async function removeScheduleAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const batchId = requireId(str(formData, "batchId"), "Batch");
  const scheduleId = requireId(str(formData, "scheduleId"), "Schedule");
  return runAction(`/teacher/batches/${batchId}`, async () => {
    await batches.removeSchedule(t.id, batchId, scheduleId);
    return { message: "Class time removed." };
  });
}

// ---- Attendance ----

function attendancePath(batchId: string, date: string): string {
  return `/teacher/attendance?batch=${encodeURIComponent(batchId)}&date=${encodeURIComponent(date)}`;
}

export async function saveAttendanceAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const batchId = requireId(str(formData, "batchId"), "Batch");
  const date = requireText(str(formData, "date"), "Date", 10);
  return runAction(attendancePath(batchId, date), async () => {
    const raw = fieldsWithPrefix(formData, "s_");
    // "NONE" means "not marked": the day's record is removed so it can be marked again.
    const clearIds = Object.entries(raw).filter(([, v]) => v === "NONE").map(([id]) => id);
    const entries = Object.entries(raw)
      .filter(([, v]) => v !== "NONE")
      .map(([studentId, status]) => ({ studentId, status: attendance.parseStatus(status) }));
    const removed = clearIds.length ? await attendance.clearAttendance(t.id, batchId, date, clearIds) : 0;
    const r = entries.length
      ? await attendance.saveAttendance(t.id, batchId, date, entries)
      : { saved: 0, noticesQueued: 0, noticesSkipped: 0 };
    const notices = r.noticesQueued ? ` ${r.noticesQueued} absence notice${r.noticesQueued === 1 ? "" : "s"} queued.` : "";
    const skipped = r.noticesSkipped ? ` ${r.noticesSkipped} notice${r.noticesSkipped === 1 ? " was" : "s were"} not sent because the SMS allowance is used up.` : "";
    const cleared = removed ? ` ${removed} mark${removed === 1 ? " was" : "s were"} removed.` : "";
    return { message: `Attendance saved for ${r.saved} student${r.saved === 1 ? "" : "s"}.${notices}${skipped}${cleared}` };
  });
}

export async function markAllPresentAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const batchId = requireId(str(formData, "batchId"), "Batch");
  const date = requireText(str(formData, "date"), "Date", 10);
  return runAction(attendancePath(batchId, date), async () => {
    const r = await attendance.markAllPresent(t.id, batchId, date);
    return { message: `Everyone marked present (${r.saved} recorded).` };
  });
}

// ---- Exams and results ----

export async function createExamAction(formData: FormData): Promise<void> {
  const t = await teacher();
  return runAction("/teacher/exams", async () => {
    const batchIds = strs(formData, "batchIds");
    const input = exams.parseExamInput(fields(formData), batchIds);
    const id = await exams.createExam(t.id, input);
    return { message: "Exam scheduled. Student notices are queued.", redirectTo: `/teacher/exams/${id}` };
  });
}

export async function saveMarksAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const examId = requireId(str(formData, "examId"), "Exam");
  return runAction(`/teacher/exams/${examId}`, async () => {
    const marks = fieldsWithPrefix(formData, "m_");
    const absent = new Set(strs(formData, "absent"));
    const ids = new Set([...Object.keys(marks), ...absent]);
    const entries = [...ids].map((studentId) => {
      const raw = (marks[studentId] ?? "").trim();
      return {
        studentId,
        absent: absent.has(studentId),
        marks: raw === "" ? null : requireNumber(raw, "Marks", 0, 10_000),
      };
    });
    const changed = await exams.saveMarks(t.id, examId, entries);
    return { message: changed ? `Saved ${changed} result${changed === 1 ? "" : "s"}.` : "No changes to save." };
  });
}

export async function publishResultsAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const examId = requireId(str(formData, "examId"), "Exam");
  return runAction(`/teacher/exams/${examId}`, async () => {
    const r = await exams.publishResults(t.id, examId);
    const skipped = r.noticesSkipped ? ` ${r.noticesSkipped} notice${r.noticesSkipped === 1 ? " was" : "s were"} not sent: SMS allowance used up.` : "";
    return { message: `Published ${r.published} result${r.published === 1 ? "" : "s"}. ${r.noticesQueued} guardian notice${r.noticesQueued === 1 ? "" : "s"} queued.${skipped}` };
  });
}

// ---- Payments ----

export async function generateChargesAction(formData: FormData): Promise<void> {
  const t = await teacher();
  return runAction("/teacher/payments", async () => {
    const period = requireText(str(formData, "period"), "Month", 7);
    const count = await payments.generateCharges(t.id, period);
    return { message: `${count} new charge${count === 1 ? "" : "s"} created for ${period}. Existing charges were left unchanged.` };
  });
}

export async function recordPaymentAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const studentId = requireId(str(formData, "studentId"), "Student");
  return runAction("/teacher/payments", async () => {
    await payments.recordPayment(t.id, studentId, { ...fields(formData), method: str(formData, "method") as PaymentMethod });
    return { message: "Payment recorded." };
  });
}

// ---- SMS ----

export async function sendMessageAction(formData: FormData): Promise<void> {
  const t = await teacher();
  return runAction("/teacher/sms", async () => {
    const kind = str(formData, "target");
    const target: comms.Target =
      kind === "all"
        ? { kind: "all" }
        : kind === "student"
          ? { kind: "student", studentId: requireId(str(formData, "studentId"), "Student") }
          : { kind: "batches", batchIds: strs(formData, "batchIds") };
    const body = str(formData, "body");
    if (str(formData, "confirm") !== "yes") throw new UserError("Tick the confirmation box to send.");
    const r = await comms.sendMessage(t.id, target, body);
    const skipped = r.skippedNoPhone ? ` ${r.skippedNoPhone} recipient${r.skippedNoPhone === 1 ? " has" : "s have"} no phone number on file and were skipped.` : "";
    return { message: `Queued for ${r.recipients} recipient${r.recipients === 1 ? "" : "s"}.${skipped}` };
  });
}

export async function refreshBalanceAction(): Promise<void> {
  await teacher();
  return runAction("/teacher/sms", async () => {
    if (providerMode() === "unconfigured") throw new UserError("The SMS provider is not configured on this server.");
    const b = await refreshSmsBalance();
    if (b.status !== "ok") throw new UserError("The SMS provider could not be reached. The last known balance is shown.");
    return { message: "Balance refreshed." };
  });
}

export async function toggleAbsenceSmsAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const enabled = str(formData, "enabled") === "1";
  return runAction("/teacher/sms", async () => {
    await db.$transaction(async (tx) => {
      await tx.teacherProfile.update({ where: { userId: t.id }, data: { absenceSmsEnabled: enabled } });
      await audit(tx, { actorId: t.id, action: "settings.absence_sms", entityType: "teacher", entityId: t.id, changes: { enabled } });
    });
    return { message: enabled ? "Absence notices are on." : "Absence notices are off." };
  });
}

// ---- Teachers ----

export async function inviteTeacherAction(formData: FormData): Promise<void> {
  const t = await teacher();
  return runAction("/teacher/teachers", async () => {
    const token = await teachers.inviteTeacher(t.id, str(formData, "email"));
    // The token goes into an httpOnly cookie, not the redirect URL, so it cannot leak through history or logs.
    await setInviteRevealCookie(token);
    return { message: "Invitation created. Copy the link below and share it privately. It works once and expires in 72 hours." };
  });
}

export async function dismissInviteLinkAction(): Promise<void> {
  await teacher();
  await clearInviteRevealCookie();
  redirect("/teacher/teachers");
}

export async function adjustAllowanceAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const teacherId = requireId(str(formData, "teacherId"), "Teacher");
  return runAction("/teacher/teachers", async () => {
    let delta: number;
    try {
      delta = parseCreditAmount(str(formData, "delta"), "Change");
    } catch (err) {
      throw new UserError(err instanceof Error ? err.message : "Enter a whole number of credits.");
    }
    await adjustAllowance(t.id, teacherId, delta, optionalNote(str(formData, "note")));
    return { message: `Allowance ${delta > 0 ? "increased" : "reduced"} by ${Math.abs(delta)} credit${Math.abs(delta) === 1 ? "" : "s"}.` };
  });
}

function optionalNote(value: string): string | null {
  const v = value.trim();
  return v ? v.slice(0, 200) : null;
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const id = requireId(str(formData, "invitationId"), "Invitation");
  return runAction("/teacher/teachers", async () => {
    await teachers.revokeInvitation(t.id, id);
    return { message: "Invitation revoked." };
  });
}

export async function setTeacherActiveAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const targetId = requireId(str(formData, "teacherId"), "Teacher");
  const active = str(formData, "active") === "1";
  return runAction("/teacher/teachers", async () => {
    await teachers.setTeacherActive(t.id, targetId, active);
    return { message: active ? "Teacher reactivated." : "Teacher deactivated and signed out." };
  });
}


export async function checkSendCostAction(formData: FormData): Promise<void> {
  const t = await teacher();
  return runAction("/teacher/sms", async () => {
    const kind = str(formData, "target");
    const target: comms.Target =
      kind === "all"
        ? { kind: "all" }
        : kind === "student"
          ? { kind: "student", studentId: requireId(str(formData, "studentId"), "Student") }
          : { kind: "batches", batchIds: strs(formData, "batchIds") };
    const r = await comms.estimateSendCost(t.id, target, str(formData, "body"));
    const q = r.quote;
    const source = q.source === "provider" ? "priced by Nishchit" : `local estimate (${q.reason ?? "provider unavailable"})`;
    return {
      message: `Estimate for ${r.recipients} recipient${r.recipients === 1 ? "" : "s"}: ${q.creditsPerMessage} credit${q.creditsPerMessage === 1 ? "" : "s"} each, about ${q.totalCredits} in total. ${source}.`,
    };
  });
}

export async function deleteStudentAction(formData: FormData): Promise<void> {
  const t = await teacher();
  const studentId = requireId(str(formData, "studentId"), "Student");
  return runAction("/teacher/students", async () => {
    const message = await students.deleteStudent(t.id, studentId);
    return { message, redirectTo: "/teacher/students" };
  });
}
