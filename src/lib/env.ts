// Validated server configuration. Parsed lazily so `next build` can run without a database.
// Error messages name the variables that are wrong, never their values.

export interface Env {
  NODE_ENV: "development" | "test" | "production";
  DATABASE_URL: string;
  APP_URL: string;
  INITIAL_TEACHER_EMAIL?: string;
  INITIAL_TEACHER_PASSWORD?: string;
  INITIAL_TEACHER_NAME: string;
  NISHCHIT_API_BASE_URL: string;
  NISHCHIT_API_KEY?: string;
  NISHCHIT_WEBHOOK_SECRET?: string;
  ALLOW_LIVE_SMS: boolean;
  JOB_RUNNER: "on" | "off";
  CRON_SECRET?: string;
}

function isUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseEnv(
  src: Readonly<Record<string, string | undefined>>,
): Env {
  const pick = (key: string): string | undefined => {
    const v = src[key];
    return v === undefined || v === "" ? undefined : v;
  };
  const problems: string[] = [];

  const nodeEnv = pick("NODE_ENV") ?? "development";
  if (!["development", "test", "production"].includes(nodeEnv))
    problems.push("NODE_ENV (development, test or production)");

  const databaseUrl = pick("DATABASE_URL");
  if (!databaseUrl) problems.push("DATABASE_URL (is required)");

  const appUrl = pick("APP_URL") ?? "http://tuterax.vercel.app";
  if (!isUrl(appUrl)) problems.push("APP_URL (must be an http or https URL)");

  const email = pick("INITIAL_TEACHER_EMAIL");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    problems.push("INITIAL_TEACHER_EMAIL (must be an email address)");

  const password = pick("INITIAL_TEACHER_PASSWORD");
  if (password && password.length < 8)
    problems.push("INITIAL_TEACHER_PASSWORD (at least 8 characters)");

  const apiBase = pick("NISHCHIT_API_BASE_URL") ?? "https://api.nishchit.tech";
  if (!isUrl(apiBase))
    problems.push("NISHCHIT_API_BASE_URL (must be an http or https URL)");

  const allowLive = pick("ALLOW_LIVE_SMS") ?? "false";
  if (allowLive !== "true" && allowLive !== "false")
    problems.push("ALLOW_LIVE_SMS (true or false)");

  const runner = pick("JOB_RUNNER") ?? "on";
  if (runner !== "on" && runner !== "off")
    problems.push("JOB_RUNNER (on or off)");

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration: ${problems.join(", ")}`,
    );
  }
  if (nodeEnv === "production" && !appUrl.startsWith("https://")) {
    throw new Error(
      "Invalid environment configuration: APP_URL (must use https in production)",
    );
  }

  return {
    NODE_ENV: nodeEnv as Env["NODE_ENV"],
    DATABASE_URL: databaseUrl as string,
    APP_URL: appUrl,
    INITIAL_TEACHER_EMAIL: email,
    INITIAL_TEACHER_PASSWORD: password,
    INITIAL_TEACHER_NAME: pick("INITIAL_TEACHER_NAME") ?? "Main Administrator",
    NISHCHIT_API_BASE_URL: apiBase,
    NISHCHIT_API_KEY: pick("NISHCHIT_API_KEY"),
    NISHCHIT_WEBHOOK_SECRET: pick("NISHCHIT_WEBHOOK_SECRET"),
    ALLOW_LIVE_SMS: allowLive === "true",
    JOB_RUNNER: runner as Env["JOB_RUNNER"],
    CRON_SECRET: pick("CRON_SECRET"),
  };
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
