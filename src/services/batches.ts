import { db } from "@/lib/db";
import { UserError, isUniqueViolation } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { isTime } from "@/lib/dates";
import { optionalText, requireId, requireText } from "@/lib/validate";
import { parseWhatsappLink } from "@/lib/whatsapp";
import { assertBatchOwned, assertStudentOfTeacher } from "./scope";

/** Lists a teacher's batches. `search` (optional) matches name, class or subject, ignoring case. */
export async function listBatches(teacherId: string, archived: boolean, search?: string) {
  const q = (search ?? "").trim().slice(0, 80);
  return db.batch.findMany({
    where: {
      teacherId,
      archivedAt: archived ? { not: null } : null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { className: { contains: q, mode: "insensitive" as const } },
              { subject: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      className: true,
      subject: true,
      whatsappLink: true,
      archivedAt: true,
      _count: { select: { members: { where: { leftAt: null } }, schedules: true } },
    },
  });
}

export async function createBatch(teacherId: string, raw: Record<string, string>): Promise<string> {
  const name = requireText(raw.name, "Batch name", 80);
  const className = requireText(raw.className, "Class", 40);
  const subject = optionalText(raw.subject, 60);
  const whatsappLink = parseWhatsappLink(raw.whatsappLink);
  try {
    return await db.$transaction(async (tx) => {
      const batch = await tx.batch.create({ data: { teacherId, name, className, subject, whatsappLink } });
      await audit(tx, { actorId: teacherId, action: "batch.create", entityType: "batch", entityId: batch.id });
      return batch.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("You already have a batch with this name.");
    throw err;
  }
}

export async function updateBatch(teacherId: string, batchId: string, raw: Record<string, string>): Promise<void> {
  await assertBatchOwned(teacherId, batchId);
  const name = requireText(raw.name, "Batch name", 80);
  const className = requireText(raw.className, "Class", 40);
  const subject = optionalText(raw.subject, 60);
  try {
    await db.$transaction(async (tx) => {
      await tx.batch.update({ where: { id: batchId }, data: { name, className, subject } });
      await audit(tx, { actorId: teacherId, action: "batch.update", entityType: "batch", entityId: batchId });
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new UserError("You already have a batch with this name.");
    throw err;
  }
}

/** Sets or clears (empty value) the batch's WhatsApp group link. Touches nothing else on the batch. */
export async function setBatchWhatsappLink(teacherId: string, batchId: string, raw: Record<string, string>): Promise<boolean> {
  await assertBatchOwned(teacherId, batchId);
  const whatsappLink = parseWhatsappLink(raw.whatsappLink);
  await db.$transaction(async (tx) => {
    await tx.batch.update({ where: { id: batchId }, data: { whatsappLink } });
    await audit(tx, {
      actorId: teacherId,
      action: "batch.whatsapp_link",
      entityType: "batch",
      entityId: batchId,
      changes: { set: whatsappLink !== null },
    });
  });
  return whatsappLink !== null;
}

export async function setBatchArchived(teacherId: string, batchId: string, archived: boolean): Promise<void> {
  await assertBatchOwned(teacherId, batchId);
  await db.$transaction(async (tx) => {
    await tx.batch.update({ where: { id: batchId }, data: { archivedAt: archived ? new Date() : null } });
    await audit(tx, { actorId: teacherId, action: archived ? "batch.archive" : "batch.restore", entityType: "batch", entityId: batchId });
  });
}

export async function getBatch(teacherId: string, batchId: string) {
  const batch = await db.batch.findFirst({
    where: { id: batchId, teacherId },
    select: {
      id: true,
      name: true,
      className: true,
      subject: true,
      whatsappLink: true,
      archivedAt: true,
      members: {
        where: { leftAt: null },
        orderBy: { joinedAt: "asc" },
        select: {
          studentId: true,
          student: { select: { user: { select: { name: true, username: true } }, guardian: { select: { phoneE164: true } } } },
        },
      },
      schedules: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }], select: { id: true, weekday: true, startMinute: true, endMinute: true, room: true } },
    },
  });
  if (!batch) throw new UserError("Batch not found.");

  const memberIds = batch.members.map((m) => m.studentId);
  const otherStudents = await db.teacherStudent.findMany({
    where: { teacherId, student: { archivedAt: null, userId: { notIn: memberIds.length ? memberIds : ["_"] } } },
    orderBy: { student: { user: { name: "asc" } } },
    select: { student: { select: { userId: true, user: { select: { name: true, username: true } } } } },
  });
  return { batch, options: otherStudents.map((o) => o.student) };
}

/** Adds students to a batch. Previously removed students are reinstated, which keeps their history. */
export async function addStudentsToBatch(teacherId: string, batchId: string, studentIds: string[]): Promise<number> {
  await assertBatchOwned(teacherId, batchId);
  if (studentIds.length === 0) throw new UserError("Select at least one student.");
  for (const id of studentIds) await assertStudentOfTeacher(teacherId, requireId(id, "Student"));

  return db.$transaction(async (tx) => {
    let added = 0;
    for (const studentId of studentIds) {
      const existing = await tx.batchStudent.findUnique({ where: { batchId_studentId: { batchId, studentId } } });
      if (existing && existing.leftAt === null) continue;
      if (existing) {
        await tx.batchStudent.update({ where: { batchId_studentId: { batchId, studentId } }, data: { leftAt: null, joinedAt: new Date() } });
      } else {
        await tx.batchStudent.create({ data: { batchId, studentId } });
      }
      added++;
    }
    await audit(tx, { actorId: teacherId, action: "batch.add_students", entityType: "batch", entityId: batchId, changes: { count: added } });
    return added;
  });
}

export async function removeStudentFromBatch(teacherId: string, batchId: string, studentId: string): Promise<void> {
  await assertBatchOwned(teacherId, batchId);
  await db.$transaction(async (tx) => {
    await tx.batchStudent.updateMany({ where: { batchId, studentId, leftAt: null }, data: { leftAt: new Date() } });
    await audit(tx, { actorId: teacherId, action: "batch.remove_student", entityType: "batch", entityId: batchId, changes: { studentId } });
  });
}

export async function addSchedule(teacherId: string, batchId: string, raw: Record<string, string>): Promise<void> {
  await assertBatchOwned(teacherId, batchId);
  const weekday = Number(raw.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new UserError("Choose a day of the week.");
  if (!isTime(raw.start ?? "") || !isTime(raw.end ?? "")) throw new UserError("Enter start and end times as HH:MM.");
  const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const startMinute = toMinutes(raw.start as string);
  const endMinute = toMinutes(raw.end as string);
  if (endMinute <= startMinute) throw new UserError("The end time must be after the start time.");
  await db.schedule.create({
    data: { batchId, weekday, startMinute, endMinute, room: optionalText(raw.room, 40) },
  });
}

export async function removeSchedule(teacherId: string, batchId: string, scheduleId: string): Promise<void> {
  await assertBatchOwned(teacherId, batchId);
  await db.schedule.deleteMany({ where: { id: scheduleId, batchId } });
}
