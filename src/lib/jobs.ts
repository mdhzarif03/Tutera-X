import { db } from "@/lib/db";
import { deliverRecipient } from "@/lib/sms/service";

/**
 * Persistent job runner. Safe with any number of application instances:
 *
 * - Every job is claimed by one conditional UPDATE. Only one worker, in one instance, wins a claim.
 * - A claim carries a lock expiry. If the worker dies, the job becomes claimable again once the lock
 *   expires. That includes jobs still marked RUNNING, which an earlier version never reclaimed.
 * - Delivery is at-least-once. A reclaimed send reuses the recipient's idempotency key, so Nishchit
 *   returns the original message instead of sending a second one. Settlement is idempotent too.
 */

export const LOCK_MS = 2 * 60 * 1000;
const POLL_MS = 5_000;

interface RunnerState {
  timer?: ReturnType<typeof setInterval>;
  inFlight?: Promise<unknown> | null;
}
const state = globalThis as unknown as { __txJobRunner?: RunnerState };

/** Claims one job if it is due and unlocked. Returns its attempt number, or null if another worker has it. */
export async function claimJob(jobId: string, now: Date = new Date()): Promise<number | null> {
  const claimed = await db.notificationJob.updateMany({
    where: {
      id: jobId,
      runAfter: { lte: now },
      OR: [
        { status: { in: ["PENDING", "FAILED_RETRYABLE"] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
        { status: "RUNNING", lockedUntil: { lt: now } },
      ],
    },
    data: { status: "RUNNING", lockedUntil: new Date(now.getTime() + LOCK_MS), attempts: { increment: 1 } },
  });
  if (claimed.count !== 1) return null;
  const row = await db.notificationJob.findUnique({ where: { id: jobId }, select: { attempts: true } });
  return row?.attempts ?? null;
}

async function processJob(
  job: { id: string; kind: string; payload: unknown; maxAttempts: number },
  attempt: number,
): Promise<void> {
  if (job.kind !== "send_sms_recipient") {
    await db.notificationJob.update({
      where: { id: job.id },
      data: { status: "FAILED_PERMANENT", lockedUntil: null, lastError: "unknown job kind" },
    });
    return;
  }

  const { smsRecipientId } = job.payload as { smsRecipientId: string };
  const outcome = await deliverRecipient(smsRecipientId, attempt);

  if (outcome.kind === "done") {
    await db.notificationJob.update({
      where: { id: job.id },
      data: { status: "SUCCEEDED", lockedUntil: null, lastError: null },
    });
  } else if (outcome.kind === "retry" && attempt < job.maxAttempts) {
    await db.notificationJob.update({
      where: { id: job.id },
      data: { status: "FAILED_RETRYABLE", runAfter: outcome.at, lockedUntil: null, lastError: outcome.reason },
    });
  } else {
    // Retries exhausted: the job and its recipient both end as failed, and any reservation is released.
    const reason = outcome.kind === "permanent" ? outcome.reason : "max_attempts";
    await db.notificationJob.update({
      where: { id: job.id },
      data: { status: "FAILED_PERMANENT", lockedUntil: null, lastError: reason },
    });
    await db.smsRecipient.updateMany({
      where: { id: smsRecipientId, status: { in: ["QUEUED", "SUBMITTING"] } },
      data: { status: "FAILED", failedAt: new Date(), lastErrorCode: reason },
    });
  }
}

/** Processes up to `limit` due jobs. Returns how many this call claimed. */
export async function runDueJobs(limit = 20): Promise<number> {
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
    select: { id: true },
  });

  let processed = 0;
  for (const { id } of due) {
    const attempt = await claimJob(id);
    if (attempt === null) continue;

    const job = await db.notificationJob.findUnique({
      where: { id },
      select: { id: true, kind: true, payload: true, maxAttempts: true },
    });
    if (!job) continue;
    processed++;

    try {
      await processJob(job, attempt);
    } catch (err) {
      console.error("[jobs] job failed unexpectedly:", id, err instanceof Error ? err.name : "unknown");
      await db.notificationJob
        .update({
          where: { id },
          data: { status: "FAILED_RETRYABLE", runAfter: new Date(Date.now() + 60_000), lockedUntil: null, lastError: "internal" },
        })
        .catch(() => undefined);
    }
  }
  return processed;
}

/** Starts the in-process poller once per Node process. Set JOB_RUNNER=off to use the cron endpoint instead. */
export function startJobRunner(): void {
  const s = (state.__txJobRunner ??= {});
  if (s.timer) return;
  s.timer = setInterval(() => {
    if (s.inFlight) return; // never overlap polls within one process
    s.inFlight = runDueJobs()
      .catch((err: unknown) => {
        console.error("[jobs] runner error:", err instanceof Error ? err.name : "unknown");
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
