import { randomUUID } from "node:crypto";
import type { Prisma, SmsPurpose } from "@prisma/client";
import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { addMinutes, nextDhakaMidnight } from "@/lib/dates";
import { analyzeSms } from "./segments";
import { PLATFORM_PREFIX } from "./templates";
import { NishchitError, liveSendingAllowed, sendMessage } from "./nishchit";
import { readAllowance, refundProviderCredits, reserveCredits, settleRecipientCredits } from "./allowance";

export const MAX_ATTEMPTS = 6;
const SENSITIVE: ReadonlySet<SmsPurpose> = new Set(["ACCOUNT_ACTIVATION", "PASSWORD_RESET"]);
const REDACTED = "[sensitive content, redacted after sending]";

/**
 * strict: the whole send is refused if the teacher's allowance cannot cover it (used by manual sends).
 * skip:   recipients beyond the allowance are recorded as SKIPPED, and the rest still go out
 *         (used by automatic notices, which must never block attendance, exams or results).
 */
export type AllowanceMode = "strict" | "skip";

export interface QueueRecipient {
  studentId: string | null;
  phone: string;
  body: string;
}

export interface QueueResult {
  created: boolean;
  messageId: string | null;
  queued: number;
  skipped: number;
}

/** Estimated billable credits for one message: segments with the platform prefix, as Nishchit counts them. */
export function estimateCredits(body: string): number {
  return analyzeSms(`[${PLATFORM_PREFIX}] ${body}`).segments;
}

/**
 * Creates a logical message, one row per recipient, reserves allowance per recipient, and queues
 * one persistent job for each recipient that will be sent. Call inside the caller's transaction, so
 * the notice, its reservation and the business change commit or roll back together.
 */
export async function queueSms(
  tx: Prisma.TransactionClient,
  input: {
    purpose: SmsPurpose;
    dedupeKey: string;
    teacherId: string | null;
    template: string;
    recipients: QueueRecipient[];
    allowance?: AllowanceMode;
    /** Per-recipient floor from a provider quote. Reservations never fall below it. */
    minCredits?: number;
  },
): Promise<QueueResult> {
  if (input.recipients.length === 0) return { created: false, messageId: null, queued: 0, skipped: 0 };

  const existing = await tx.smsMessage.findUnique({ where: { dedupeKey: input.dedupeKey }, select: { id: true } });
  if (existing) return { created: false, messageId: existing.id, queued: 0, skipped: 0 };

  const mode: AllowanceMode = input.allowance ?? "strict";
  const floor = Math.max(0, Math.trunc(input.minCredits ?? 0));
  const credits = input.recipients.map((r) => Math.max(estimateCredits(r.body), floor));
  const needed = credits.reduce((a, b) => a + b, 0);

  if (input.teacherId && mode === "strict" && needed > 0) {
    const state = await readAllowance(tx, input.teacherId);
    if (state.remaining < needed) {
      throw new UserError(
        `Not enough message credits. You have ${state.remaining} left and this message needs about ${needed}. Ask the owner to add more.`,
      );
    }
  }

  const messageId = randomUUID();
  const first = input.recipients[0];
  const sample = analyzeSms(first?.body ?? "");
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

  const rows: Prisma.SmsRecipientCreateManyInput[] = [];
  const jobRecipientIds: string[] = [];
  let skipped = 0;

  for (let i = 0; i < input.recipients.length; i++) {
    const r = input.recipients[i];
    if (!r) continue;
    const id = randomUUID();
    const need = credits[i] ?? 0;
    let reserved = 0;
    let status: "QUEUED" | "SKIPPED" = "QUEUED";
    let skipReason: string | undefined;

    if (input.teacherId && need > 0) {
      if (await reserveCredits(tx, input.teacherId, need)) {
        reserved = need;
      } else if (mode === "strict") {
        // Unreachable in practice: the pre-check above ran in the same transaction. Kept as a guard.
        throw new UserError("Not enough SMS credits for this send.");
      } else {
        status = "SKIPPED";
        skipReason = "allowance_exhausted";
        skipped++;
      }
    }

    rows.push({
      id,
      smsMessageId: messageId,
      studentId: r.studentId,
      phoneE164: r.phone,
      body: r.body,
      idempotencyKey: randomUUID(),
      status,
      skipReason,
      reservedCredits: reserved,
    });
    if (status === "QUEUED") jobRecipientIds.push(id);
  }

  await tx.smsRecipient.createMany({ data: rows });
  if (jobRecipientIds.length > 0) {
    await tx.notificationJob.createMany({
      data: jobRecipientIds.map((id) => ({ kind: "send_sms_recipient", payload: { smsRecipientId: id }, dedupeKey: `sms:${id}` })),
    });
  }
  return { created: true, messageId, queued: jobRecipientIds.length, skipped };
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

/** Terminal update: the status change and the allowance release commit together. */
async function finalize(recipientId: string, data: Prisma.SmsRecipientUpdateInput): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.smsRecipient.update({ where: { id: recipientId }, data });
    await settleRecipientCredits(tx, recipientId, null);
  });
}

async function requeue(recipientId: string, e: NishchitError): Promise<void> {
  await db.smsRecipient.update({
    where: { id: recipientId },
    data: { status: "QUEUED", lastErrorCode: e.code, lastRequestId: e.requestId },
  });
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
  if (!r) return { kind: "done" };
  if (r.status !== "QUEUED" && r.status !== "SUBMITTING") return { kind: "done" };

  if (!liveSendingAllowed()) {
    await finalize(r.id, { status: "SKIPPED", skipReason: "live_sms_disabled" });
    return { kind: "done" };
  }

  await db.smsRecipient.update({ where: { id: r.id }, data: { status: "SUBMITTING" } });

  try {
    const m = await sendMessage({ to: r.phoneE164, body: r.body, reference: r.id, idempotencyKey: r.idempotencyKey });

    if (m.status === "failed") {
      const code = m.error?.code ?? "failed";
      await finalize(r.id, { status: "FAILED", failedAt: new Date(), lastErrorCode: code });
      return { kind: "permanent", reason: code };
    }

    const sent = m.status === "sent";
    const now = new Date();
    await db.$transaction(async (tx) => {
      await tx.smsRecipient.update({
        where: { id: r.id },
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
      // Settles the reservation against what was actually billed.
      await settleRecipientCredits(tx, r.id, m.credits);
    });
    await db.smsDeliveryAttempt.create({
      data: { smsRecipientId: r.id, attemptNumber: attempt, httpStatus: 201, retryable: false },
    });
    return { kind: "done" };
  } catch (err) {
    const e = err instanceof NishchitError ? err : new NishchitError("unknown", "Unexpected error.", 0, true);
    await db.smsDeliveryAttempt
      .create({
        data: {
          smsRecipientId: r.id,
          attemptNumber: attempt,
          httpStatus: e.httpStatus || null,
          errorCode: e.code,
          retryable: e.retryable,
          requestId: e.requestId,
        },
      })
      .catch(() => undefined);

    switch (e.code) {
      case "daily_quota_exceeded":
        await requeue(r.id, e);
        return { kind: "retry", at: nextDhakaMidnight(), reason: e.code };

      case "insufficient_credits":
      case "authentication_failed":
      case "not_configured":
        await requeue(r.id, e);
        if (e.code !== "insufficient_credits") console.error("[sms] provider configuration problem. Check NISHCHIT_API_KEY.");
        return { kind: "retry", at: addMinutes(new Date(), 60), reason: e.code };

      case "content_rejected":
        await finalize(r.id, { status: "SKIPPED", skipReason: e.code, lastErrorCode: e.code, lastRequestId: e.requestId });
        return { kind: "permanent", reason: e.code };

      case "invalid_recipient":
      case "unsupported_country":
      case "invalid_sender":
        await finalize(r.id, { status: "FAILED", failedAt: new Date(), lastErrorCode: e.code, lastRequestId: e.requestId });
        return { kind: "permanent", reason: e.code };

      default:
        if (e.retryable && attempt < MAX_ATTEMPTS) {
          await requeue(r.id, e);
          return { kind: "retry", at: new Date(Date.now() + backoffMs(attempt)), reason: e.code };
        }
        await finalize(r.id, { status: "FAILED", failedAt: new Date(), lastErrorCode: e.code, lastRequestId: e.requestId });
        return { kind: "permanent", reason: e.code };
    }
  }
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
 * undo a newer state. A failure reported after acceptance refunds the credits that were charged.
 */
export async function applyWebhookEvent(event: WebhookEvent): Promise<"applied" | "unknown_message" | "ignored"> {
  const r = await db.smsRecipient.findUnique({
    where: { nishchitMessageId: event.data.message_id },
    select: { id: true, status: true },
  });
  if (!r) return "unknown_message";

  const now = new Date();

  if (event.type === "message.failed") {
    const code = event.data.error?.code ?? "failed";
    await db.$transaction(async (tx) => {
      // Only a message we accepted has charged credits to refund. The conditional update makes this run once.
      const claimed = await tx.smsRecipient.updateMany({
        where: { id: r.id, status: "ACCEPTED" },
        data: { status: "FAILED", failedAt: now, lastErrorCode: code },
      });
      if (claimed.count === 1) await refundProviderCredits(tx, r.id);
    });
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
