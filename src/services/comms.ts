import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { queueSms } from "@/lib/sms/service";
import { contactsFor, type Contact } from "@/lib/sms/recipients";
import { analyzeSms } from "@/lib/sms/segments";
import { PLATFORM_PREFIX, render } from "@/lib/sms/templates";
import { quoteSend } from "@/lib/sms/pricing";
import { getBalance, providerMode, NishchitError } from "@/lib/sms/nishchit";
import { assertBatchOwned, assertStudentOfTeacher } from "./scope";
import { requireId } from "@/lib/validate";

export const MAX_RECIPIENTS_PER_SEND = 500;
const MAX_BODY = 480;
const BALANCE_TTL_MS = 15 * 60 * 1000;

export type Target = { kind: "batches"; batchIds: string[] } | { kind: "all" } | { kind: "student"; studentId: string };

/** Resolves a target to the students who will receive the message, without duplicates. */
export async function resolveTargetStudents(teacherId: string, target: Target): Promise<string[]> {
  if (target.kind === "student") {
    await assertStudentOfTeacher(teacherId, requireId(target.studentId, "Student"));
    return [target.studentId];
  }
  if (target.kind === "all") {
    const links = await db.teacherStudent.findMany({
      where: { teacherId, student: { archivedAt: null } },
      select: { studentId: true },
    });
    return links.map((l) => l.studentId);
  }
  if (target.batchIds.length === 0) throw new UserError("Select at least one batch.");
  for (const id of target.batchIds) await assertBatchOwned(teacherId, id);
  const members = await db.batchStudent.findMany({
    where: { batchId: { in: target.batchIds }, leftAt: null },
    select: { studentId: true },
  });
  return [...new Set(members.map((m) => m.studentId))];
}

/** Segment and credit estimate for the composer. The server's preview endpoint remains authoritative. */
export function estimateSend(body: string, recipients: number) {
  const sample = analyzeSms(`[${PLATFORM_PREFIX}] ${body.replace(/\{name\}/g, "Name")}`);
  return { segmentsPerMessage: sample.segments, encoding: sample.encoding, credits: sample.segments * recipients };
}

/** The sample body the provider prices: the longest name in the audience, so the quote is conservative. */
function sampleBody(text: string, contacts: Map<string, Contact>, teacherName: string): string {
  let longest = "";
  for (const c of contacts.values()) if (c.studentName.length > longest.length) longest = c.studentName;
  return `${render(text.replace(/\{name\}/g, "{student}"), { student: longest })} - ${teacherName}`;
}

function personalise(text: string, contacts: Map<string, Contact>, studentIds: string[], teacherName: string) {
  return studentIds.flatMap((sid) => {
    const c = contacts.get(sid);
    if (!c) return [];
    const personal = render(text.replace(/\{name\}/g, "{student}"), { student: c.studentName });
    return [{ studentId: sid, phone: c.guardianPhone, body: `${personal} - ${teacherName}` }];
  });
}

/**
 * Prices a send without sending it. Uses Nishchit's pricing preview, with local rules as the fallback.
 */
export async function estimateSendCost(teacherId: string, target: Target, rawBody: string) {
  const text = rawBody.trim();
  if (!text) throw new UserError("Write a message before checking the cost.");
  const studentIds = await resolveTargetStudents(teacherId, target);
  const contacts = await contactsFor(studentIds);
  const teacher = await db.user.findUniqueOrThrow({ where: { id: teacherId }, select: { name: true } });
  const recipients = personalise(text, contacts, studentIds, teacher.name);
  const quote = await quoteSend(sampleBody(text, contacts, teacher.name), recipients.length);
  return { recipients: recipients.length, quote };
}

export async function sendMessage(
  teacherId: string,
  target: Target,
  rawBody: string,
): Promise<{ recipients: number; skippedNoPhone: number }> {
  const text = rawBody.trim();
  if (!text) throw new UserError("Write a message before sending.");
  if (text.length > MAX_BODY) throw new UserError(`Messages must be ${MAX_BODY} characters or fewer.`);

  const studentIds = await resolveTargetStudents(teacherId, target);
  if (studentIds.length === 0) throw new UserError("No students match this selection.");
  if (studentIds.length > MAX_RECIPIENTS_PER_SEND) {
    throw new UserError(`You can message up to ${MAX_RECIPIENTS_PER_SEND} people at once. Split the audience and send again.`);
  }

  // One shared balance for everyone. If it is already known to be empty, say so before queueing.
  const snap = await db.smsBalanceSnapshot.findUnique({ where: { id: "singleton" }, select: { credits: true, apiStatus: true } });
  if (snap && snap.apiStatus === "ok" && snap.credits <= 0) {
    throw new UserError("The message balance is empty, so messages cannot be sent. Top up at nishchit.tech first.");
  }

  const contacts = await contactsFor(studentIds);
  const teacher = await db.user.findUniqueOrThrow({ where: { id: teacherId }, select: { name: true } });
  const recipients = personalise(text, contacts, studentIds, teacher.name);

  const purpose = target.kind === "student" ? "INDIVIDUAL_MESSAGE" : "BULK_MESSAGE";
  await db.$transaction(
    async (tx) => {
      const result = await queueSms(tx, {
        purpose,
        dedupeKey: `comms:${randomUUID()}`,
        teacherId,
        template: text,
        recipients,
      });
      await audit(tx, {
        actorId: teacherId,
        action: "sms.send",
        entityType: "sms_message",
        entityId: result.messageId,
        changes: { target: target.kind, queued: result.queued },
      });
    },
    { timeout: 30_000 },
  );
  return { recipients: recipients.length, skippedNoPhone: studentIds.length - recipients.length };
}

export async function listSmsHistory(teacherId: string, take = 40) {
  return db.smsRecipient.findMany({
    where: { smsMessage: { teacherId } },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      status: true,
      deliveryStatus: true,
      skipReason: true,
      lastErrorCode: true,
      createdAt: true,
      phoneE164: true,
      smsMessage: { select: { purpose: true } },
      student: { select: { user: { select: { name: true } } } },
    },
  });
}

export async function smsStatusCounts(teacherId: string) {
  const rows = await db.smsRecipient.groupBy({
    by: ["status"],
    where: { smsMessage: { teacherId } },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r._count._all;
  return out;
}

/** Returns the cached Nishchit balance, refreshing it from the provider when stale or forced. */
export async function getSmsBalance(opts: { force?: boolean } = {}) {
  const snap = await db.smsBalanceSnapshot.findUnique({ where: { id: "singleton" } });
  const stale = !snap || Date.now() - snap.fetchedAt.getTime() > BALANCE_TTL_MS;
  const mode = providerMode();
  if (mode === "unconfigured") {
    return { credits: snap?.credits ?? null, currency: snap?.currency ?? "BDT", asOf: snap?.nishchitAsOf ?? null, fetchedAt: snap?.fetchedAt ?? null, status: "not_configured" as const, mode };
  }
  // An explicit refresh waits for the provider, so the user sees the result.
  if (opts.force) return refreshSmsBalance(mode);
  // Pages never wait on the provider. Return the last known value at once, and refresh in the background.
  if (stale) void refreshSmsBalance(mode).catch(() => undefined);
  if (snap) {
    return { credits: snap.credits, currency: snap.currency, asOf: snap.nishchitAsOf, fetchedAt: snap.fetchedAt, status: snap.apiStatus, mode };
  }
  return { credits: null, currency: "BDT", asOf: null, fetchedAt: null, status: "unchecked" as const, mode };
}

export async function refreshSmsBalance(mode = providerMode()) {
  try {
    const b = await getBalance();
    const now = new Date();
    const asOf = new Date(b.as_of);
    const row = await db.smsBalanceSnapshot.upsert({
      where: { id: "singleton" },
      update: { credits: b.credits, currency: b.currency, nishchitAsOf: asOf, fetchedAt: now, apiStatus: "ok" },
      create: { id: "singleton", credits: b.credits, currency: b.currency, nishchitAsOf: asOf, fetchedAt: now, apiStatus: "ok" },
    });
    return { credits: row.credits, currency: row.currency, asOf: row.nishchitAsOf, fetchedAt: row.fetchedAt, status: "ok" as const, mode };
  } catch (err) {
    const status = err instanceof NishchitError && err.code === "authentication_failed" ? "auth_failed" : "unreachable";
    const prev = await db.smsBalanceSnapshot.findUnique({ where: { id: "singleton" } });
    await db.smsBalanceSnapshot.upsert({
      where: { id: "singleton" },
      update: { apiStatus: status, fetchedAt: new Date() },
      create: { id: "singleton", credits: 0, currency: "BDT", nishchitAsOf: new Date(0), fetchedAt: new Date(), apiStatus: status },
    });
    return {
      credits: prev?.credits ?? null,
      currency: prev?.currency ?? "BDT",
      asOf: prev?.nishchitAsOf ?? null,
      fetchedAt: prev?.fetchedAt ?? null,
      status: status as "auth_failed" | "unreachable",
      mode,
    };
  }
}
