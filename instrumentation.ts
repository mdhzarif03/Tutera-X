// Runs once when the Node.js server starts: validates configuration, creates the initial teacher
// account if it does not exist, starts the background SMS runner, and drains it on shutdown.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getEnv } = await import("@/lib/env");
  try {
    getEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Invalid environment");
    if (process.env.NODE_ENV === "production") process.exit(1);
    return;
  }

  const { ensureInitialTeacher } = await import("@/lib/auth/bootstrap");
  try {
    // Reports what happened, so a sign-in problem can be diagnosed from the terminal. Never prints the password.
    const result = await ensureInitialTeacher();
    const meaning: Record<string, string> = {
      created: "owner account created from .env",
      exists: "an owner account with INITIAL_TEACHER_EMAIL already exists; its password is NOT changed by .env",
      skipped: "INITIAL_TEACHER_EMAIL or INITIAL_TEACHER_PASSWORD is empty in .env; no account was created",
    };
    console.info(`[bootstrap] ${result}: ${meaning[result] ?? ""}`);
  } catch {
    console.error("[bootstrap] could not verify the initial teacher account. Run migrations first.");
  }

  const { startJobRunner, stopJobRunner } = await import("@/lib/jobs");
  if (getEnv().JOB_RUNNER === "on") startJobRunner();

  const shutdown = () => {
    stopJobRunner().finally(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
