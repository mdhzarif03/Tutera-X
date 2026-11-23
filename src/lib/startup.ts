import { getEnv } from "./env";
import { ensureInitialTeacher } from "./auth/bootstrap";
import { startJobRunner, stopJobRunner } from "./jobs";

/**
 * One-time startup work for each Node.js process: create the owner account from .env if it is
 * missing, and start the SMS job runner. It runs on the first request, not at server boot, because
 * Next.js compiles instrumentation for an edge target where the native argon2 package cannot load.
 * Requests run in Node, so this path is safe. If startup fails (for example, migrations are not
 * applied yet), it is logged and retried on the next request, never cached as done.
 */

interface StartupState {
  done?: boolean;
  inProgress?: Promise<void>;
  shutdownRegistered?: boolean;
}
const state = globalThis as unknown as { __txStartup?: StartupState };

export function ensureStartup(): Promise<void> {
  const s = (state.__txStartup ??= {});
  if (s.done) return Promise.resolve();
  s.inProgress ??= attempt(s).finally(() => {
    s.inProgress = undefined;
  });
  return s.inProgress;
}

async function attempt(s: StartupState): Promise<void> {
  try {
    getEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Invalid environment configuration.");
    return;
  }

  try {
    const result = await ensureInitialTeacher();
    const meaning: Record<string, string> = {
      created: "owner account created from .env",
      exists: "an owner account with INITIAL_TEACHER_EMAIL already exists; its password is not changed by .env",
      skipped: "INITIAL_TEACHER_EMAIL or INITIAL_TEACHER_PASSWORD is empty in .env; no account was created",
    };
    console.info(`[bootstrap] ${result}: ${meaning[result] ?? ""}`);
  } catch {
    console.error("[bootstrap] could not verify the initial teacher account. Run migrations first, then retry.");
    return;
  }

  if (getEnv().JOB_RUNNER === "on") startJobRunner();

  if (!s.shutdownRegistered) {
    s.shutdownRegistered = true;
    const shutdown = () => {
      stopJobRunner().finally(() => process.exit(0));
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  }
  s.done = true;
}
