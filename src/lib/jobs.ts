import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { logUnexpectedError, prismaRetryReason } from "@/lib/errors";
import { retryDelayMs, smsRecipientIdFromPayload } from "@/lib/job-utils";
import { deliverRecipient } from "@/lib/sms/service";

/**
 * Persistent job runner. Claims are fenced by their incrementing attempt number. Provider calls
 * remain at-least-once, with the recipient's idempotency key preventing duplicate SMS delivery.
 */

export const LOCK_MS = 2 * 60 * 1000;
const POLL_MS = 5_000;

interface RunnerState {
  timer?: ReturnType<typeof setInterval>;
  inFlight?: Promise<unknown> | null;
}
const state = globalThis as unknown as { __txJobRunner?: RunnerState };

/** Claims one due job and returns its exact fencing/attempt number. */
export async function claimJob(jobId: string, now: Date = new Date()): Promise<number | null> {
  const claimed = await db.notificationJob.updateManyAndReturn({
    where: {
      id: jobId,
      runAfter: { lte: now },
      OR: [
        { status: { in: ["PENDING", "FAILED_RETRYABLE"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        { status: "RUNNING", lockedUntil: { lt: now } },
      ],
    },
    data: { status: "RUNNING", lockedUntil: new Date(now.getTime() + LOCK_MS), attempts: { increment: 1 } },
    select: { attempts: true },
  });
  return claimed[0]?.attempts ?? null;
}

type Job = { id: string; kind: string; payload: unknown; maxAttempts: number };
type JobResult =
  | { kind: "done"; smsRecipientId: string | null }
  | { kind: "retry"; at: Date; reason: string; smsRecipientId: string | null }
  | { kind: "permanent"; reason: string; smsRecipientId: string | null };

async function processJob(job: Job, attempt: number): Promise<JobResult> {
  if (job.kind !== "send_sms_recipient") {
    return { kind: "permanent", reason: "unknown_job_kind", smsRecipientId: null };
  }

  const smsRecipientId = smsRecipientIdFromPayload(job.payload);
  if (!smsRecipientId) {
    return { kind: "permanent", reason: "invalid_job_payload", smsRecipientId: null };
  }

  const outcome = await deliverRecipient(smsRecipientId, attempt);
  if (outcome.kind === "done") return { kind: "done", smsRecipientId };
  if (outcome.kind === "permanent") return { kind: "permanent", reason: outcome.reason, smsRecipientId };
  if (attempt < job.maxAttempts) return { ...outcome, smsRecipientId };
  return { kind: "permanent", reason: "max_attempts", smsRecipientId };
}

async function persistResult(job: Job, attempt: number, result: JobResult): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const data =
      result.kind === "done"
        ? { status: "SUCCEEDED" as const, lockedUntil: null, lastError: null }
        : result.kind === "retry"
          ? { status: "FAILED_RETRYABLE" as const, runAfter: result.at, lockedUntil: null, lastError: result.reason }
          : { status: "FAILED_PERMANENT" as const, lockedUntil: null, lastError: result.reason };
    const updated = await tx.notificationJob.updateMany({
      where: { id: job.id, status: "RUNNING", attempts: attempt },
      data,
    });
    if (updated.count !== 1) return false;

    if (result.kind === "permanent" && result.smsRecipientId) {
      await tx.smsRecipient.updateMany({
        where: { id: result.smsRecipientId, status: { in: ["QUEUED", "SUBMITTING"] } },
        data: { status: "FAILED", failedAt: new Date(), lastErrorCode: result.reason },
      });
    }
    return true;
  });
}

/** Processes up to `limit` due jobs. Returns how many this call claimed. */
export async function runDueJobs(limit = 20, requestId?: string): Promise<number> {
  const correlationId = requestId ?? randomUUID();
  const now = new Date();
  const due = await db.notificationJob.findMany({
    where: {
      runAfter: { lte: now },
      OR: [
        { status: { in: ["PENDING", "FAILED_RETRYABLE"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        { status: "RUNNING", lockedUntil: { lt: now } },
      ],
    },
    orderBy: { runAfter: "asc" },
    take: limit,
    select: { id: true, kind: true, payload: true, maxAttempts: true },
  });

  let processed = 0;
  for (const job of due) {
    let attempt: number | null;
    try {
      attempt = await claimJob(job.id);
    } catch (err) {
      logUnexpectedError("[jobs] claim failed", { operation: "job.claim", jobId: job.id, requestId: correlationId }, err);
      continue;
    }
    if (attempt === null) continue;
    processed++;

    let result: JobResult;
    if (attempt > job.maxAttempts) {
      result = { kind: "permanent", reason: "max_attempts", smsRecipientId: smsRecipientIdFromPayload(job.payload) };
    } else {
      try {
        result = await processJob(job, attempt);
      } catch (err) {
        logUnexpectedError("[jobs] job failed unexpectedly", {
          operation: `job.process:${job.kind}`,
          model: job.kind === "send_sms_recipient" ? "SmsRecipient" : "NotificationJob",
          jobId: job.id,
          requestId: correlationId,
        }, err);
        result = attempt < job.maxAttempts
          ? {
              kind: "retry",
              at: new Date(Date.now() + retryDelayMs(attempt)),
              reason: prismaRetryReason(err),
              smsRecipientId: smsRecipientIdFromPayload(job.payload),
            }
          : {
              kind: "permanent",
              reason: prismaRetryReason(err),
              smsRecipientId: smsRecipientIdFromPayload(job.payload),
            };
      }
    }

    try {
      const saved = await persistResult(job, attempt, result);
      if (!saved) {
        console.warn("[jobs] stale worker result ignored", JSON.stringify({
          operation: "job.persist_result",
          jobId: job.id,
          requestId: correlationId,
          attempt,
        }));
      }
    } catch (err) {
      logUnexpectedError("[jobs] job result persistence failed", {
        operation: "job.persist_result",
        model: "NotificationJob",
        jobId: job.id,
        requestId: correlationId,
      }, err);
    }
  }
  return processed;
}

/** Starts the in-process poller once per Node process. Set JOB_RUNNER=off to use the cron endpoint instead. */
export function startJobRunner(): void {
  const s = (state.__txJobRunner ??= {});
  if (s.timer) return;
  s.timer = setInterval(() => {
    if (s.inFlight) return;
    s.inFlight = runDueJobs()
      .catch((err: unknown) => {
        logUnexpectedError("[jobs] runner error", { operation: "job.poll" }, err);
        return 0;
      })
      .finally(() => {
        s.inFlight = null;
      });
  }, POLL_MS);
}

/** Stops polling and waits for an in-flight pass to finish. Call on SIGTERM so no send is cut off midway. */
export async function stopJobRunner(): Promise<void> {
  const s = state.__txJobRunner;
  if (!s) return;
  if (s.timer) clearInterval(s.timer);
  s.timer = undefined;
  if (s.inFlight) await s.inFlight;
}
