import { randomUUID } from "node:crypto";
import type { Prisma, SmsPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { addMinutes, nextDhakaMidnight } from "@/lib/dates";
import { analyzeSms } from "./segments";
import { PLATFORM_PREFIX } from "./templates";
import { NishchitError, liveSendingAllowed, sendMessage } from "./nishchit";

// Messages are paid for from the shared Nishchit balance. There are no per-teacher limits.
// The provider charges each accepted message and refunds failed ones.

export const MAX_ATTEMPTS = 6;
const SENSITIVE: ReadonlySet<SmsPurpose> = new Set(["ACCOUNT_ACTIVATION", "TEACHER_INVITATION", "PASSWORD_RESET"]);
const REDACTED = "[sensitive content, redacted after sending]";

export interface QueueRecipient {
  studentId: string | null;
  phone: string;
  body: string;
}

export interface QueueResult {
  created: boolean;
  messageId: string | null;
  queued: number;
}

/** Estimated credits for one message, counting the platform prefix as Nishchit does. */
export function estimateCredits(body: string): number {
  return analyzeSms(`[${PLATFORM_PREFIX}] ${body}`).segments;
}

/**
 * Creates a logical message with one row per recipient, and one persistent job per recipient.
 * Call inside the caller's transaction, so the message and the business change commit together.
 * Returns created=false when the dedupe key already exists, which makes the call idempotent.
 */
export async function queueSms(
  tx: Prisma.TransactionClient,
  input: {
    purpose: SmsPurpose;
    dedupeKey: string;
    teacherId: string | null;
    template: string;
    recipients: QueueRecipient[];
  },
): Promise<QueueResult> {
  if (input.recipients.length === 0) return { created: false, messageId: null, queued: 0 };

  const existing = await tx.smsMessage.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
  if (existing) return { created: false, messageId: existing.id, queued: 0 };

  const messageId = randomUUID();
  const sample = analyzeSms(input.recipients[0]?.body ?? "");
  await tx.smsMessage.create({
    data: {
      id: messageId,
      teacherId: input.teacherId,
      purpose: input.purpose,
      templateKey: null,
      body: input.template,
      encoding: sample.encoding,
      segmentsEstimate: sample.segments,
      dedupeKey: input.dedupeKey,
    },
  });

  const rows: Prisma.SmsRecipientCreateManyInput[] = input.recipients.map((r) => ({
    id: randomUUID(),
    smsMessageId: messageId,
    studentId: r.studentId,
    phoneE164: r.phone,
    body: r.body,
    idempotencyKey: randomUUID(),
    status: "QUEUED",
  }));
  await tx.smsRecipient.createMany({ data: rows });
  await tx.notificationJob.createMany({
    data: rows.map((r) => ({ kind: "send_sms_recipient", payload: { smsRecipientId: r.id }, dedupeKey: `sms:${r.id}` })),
  });
  return { created: true, messageId, queued: rows.length };
}

export type DeliveryOutcome =
  | { kind: "done" }
  | { kind: "retry"; at: Date; reason: string }
  | { kind: "permanent"; reason: string };

function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
}

function mapDelivery(d: string | undefined): "UNKNOWN" | "DELIVERED" | "UNDELIVERED" | "REJECTED" {
  if (d === "delivered") return "DELIVERED";
  if (d === "undelivered") return "UNDELIVERED";
  if (d === "rejected") return "REJECTED";
  return "UNKNOWN";
}

async function finalize(recipientId: string, data: Prisma.SmsRecipientUpdateInput): Promise<void> {
  await db.smsRecipient.update({ where: { id: recipientId }, data });
}

/**
 * Submits one recipient to Nishchit and records the outcome. Safe to repeat: the recipient's
 * idempotency key means a retry after a timeout cannot create a second message.
 */
export async function deliverRecipient(recipientId: string, attempt: number): Promise<DeliveryOutcome> {
  const r = await db.smsRecipient.findUnique({
    where: { id: recipientId },
    select: {
      id: true,
      status: true,
      phoneE164: true,
      body: true,
      idempotencyKey: true,
      smsMessage: { select: { purpose: true } },
    },
  });
  if (!r) return { kind: "permanent", reason: "recipient_not_found" };
  if (r.status !== "QUEUED" && r.status !== "SUBMITTING") return { kind: "done" };

  if (!liveSendingAllowed()) {
    await finalize(r.id, { status: "SKIPPED", skipReason: "live_sms_disabled" });
    return { kind: "done" };
  }

  const started = await db.smsRecipient.updateMany({
    where: { id: r.id, status: { in: ["QUEUED", "SUBMITTING"] } },
    data: { status: "SUBMITTING" },
  });
  if (started.count !== 1) return { kind: "done" };

  let m: Awaited<ReturnType<typeof sendMessage>>;
  try {
    m = await sendMessage({ to: r.phoneE164, body: r.body, reference: r.id, idempotencyKey: r.idempotencyKey });
  } catch (err) {
    if (!(err instanceof NishchitError)) throw err;
    return recordProviderError(r.id, attempt, err);
  }

  if (m.status === "failed") {
    const code = m.error?.code ?? "failed";
    await db.$transaction(async (tx) => {
      await tx.smsRecipient.updateMany({
        where: { id: r.id, status: { in: ["QUEUED", "SUBMITTING"] } },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          lastErrorCode: code,
          ...(SENSITIVE.has(r.smsMessage.purpose) ? { body: REDACTED } : {}),
        },
      });
      await tx.smsDeliveryAttempt.create({
        data: { smsRecipientId: r.id, attemptNumber: attempt, httpStatus: 201, retryable: false, errorCode: code },
      });
    });
    return { kind: "permanent", reason: code };
  }

  const sent = m.status === "sent";
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.smsRecipient.updateMany({
      where: { id: r.id, status: { in: ["QUEUED", "SUBMITTING"] } },
      data: {
        status: sent ? "SENT" : "ACCEPTED",
        nishchitMessageId: m.id,
        segments: m.segments,
        credits: m.credits,
        deliveryStatus: mapDelivery(m.delivery_status),
        acceptedAt: now,
        sentAt: sent ? now : null,
        ...(SENSITIVE.has(r.smsMessage.purpose) ? { body: REDACTED } : {}),
      },
    });
    await tx.smsDeliveryAttempt.create({
      data: { smsRecipientId: r.id, attemptNumber: attempt, httpStatus: 201, retryable: false },
    });
  });
  return { kind: "done" };
}

async function recordProviderError(recipientId: string, attempt: number, error: NishchitError): Promise<DeliveryOutcome> {
  const now = new Date();
  let status: "QUEUED" | "FAILED" | "SKIPPED";
  let retryAt: Date | null = null;
  switch (error.code) {
    case "daily_quota_exceeded":
      status = "QUEUED";
      retryAt = nextDhakaMidnight();
      break;
    case "insufficient_credits":
    case "authentication_failed":
    case "not_configured":
      status = "QUEUED";
      retryAt = addMinutes(now, 60);
      if (error.code !== "insufficient_credits") console.error("[sms] provider configuration problem. Check NISHCHIT_API_KEY.");
      break;
    case "content_rejected":
      status = "SKIPPED";
      break;
    case "invalid_recipient":
    case "unsupported_country":
    case "invalid_sender":
      status = "FAILED";
      break;
    default:
      if (error.retryable && attempt < MAX_ATTEMPTS) {
        status = "QUEUED";
        retryAt = new Date(now.getTime() + backoffMs(attempt));
      } else {
        status = "FAILED";
      }
  }

  await db.$transaction(async (tx) => {
    await tx.smsRecipient.updateMany({
      where: { id: recipientId, status: { in: ["QUEUED", "SUBMITTING"] } },
      data: {
        status,
        ...(retryAt ? { lastErrorCode: error.code, lastRequestId: error.requestId } : {
          failedAt: status === "FAILED" ? now : undefined,
          skipReason: status === "SKIPPED" ? error.code : undefined,
          lastErrorCode: error.code,
          lastRequestId: error.requestId,
        }),
      },
    });
    await tx.smsDeliveryAttempt.create({
      data: {
        smsRecipientId: recipientId,
        attemptNumber: attempt,
        httpStatus: error.httpStatus || null,
        errorCode: error.code,
        retryable: error.retryable,
        requestId: error.requestId,
      },
    });
  });

  if (retryAt) return { kind: "retry", at: retryAt, reason: error.code };
  return { kind: "permanent", reason: error.code };
}

export interface WebhookEvent {
  type: string;
  data: {
    message_id: string;
    status?: string;
    delivery_status?: string;
    error?: { code?: string } | null;
  };
}

const RANK: Record<string, number> = { QUEUED: 0, SUBMITTING: 1, ACCEPTED: 2, SENT: 3, FAILED: 4, SKIPPED: 4 };

/**
 * Applies a signed Nishchit event. Status only moves forward, so a late or duplicate event cannot
 * undo a newer state. Failed messages are refunded by the provider, so nothing is adjusted here.
 */
export async function applyWebhookEvent(event: WebhookEvent): Promise<"applied" | "unknown_message" | "ignored"> {
  const r = await db.smsRecipient.findUnique({
    where: { nishchitMessageId: event.data.message_id },
    select: { id: true, status: true },
  });
  if (!r) return "unknown_message";

  const now = new Date();

  if (event.type === "message.failed") {
    if (r.status === "ACCEPTED" || r.status === "SENT") {
      await db.smsRecipient.update({
        where: { id: r.id },
        data: { status: "FAILED", failedAt: now, lastErrorCode: event.data.error?.code ?? "failed" },
      });
    }
    return "applied";
  }

  const data: Prisma.SmsRecipientUpdateInput = {};
  const advance = (to: "ACCEPTED" | "SENT") => {
    if ((RANK[to] ?? 0) > (RANK[r.status] ?? 0)) data.status = to;
  };

  switch (event.type) {
    case "message.accepted":
      advance("ACCEPTED");
      break;
    case "message.sent":
      advance("SENT");
      data.sentAt = now;
      break;
    case "message.delivered":
      data.deliveryStatus = "DELIVERED";
      data.deliveredAt = now;
      break;
    case "message.undelivered":
      data.deliveryStatus = "UNDELIVERED";
      break;
    default:
      return "ignored";
  }

  await db.smsRecipient.update({ where: { id: r.id }, data });
  return "applied";
}
