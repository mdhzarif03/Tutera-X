import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hashPassword } from "./password";
import { isUniqueViolation } from "@/lib/errors";

/**
 * Creates the initial owner account from environment variables when it does not exist.
 * An existing account is never modified, and the password is never logged.
 */
export async function ensureInitialTeacher(): Promise<"created" | "exists" | "skipped"> {
  const env = getEnv();
  if (!env.INITIAL_TEACHER_EMAIL || !env.INITIAL_TEACHER_PASSWORD) return "skipped";

  const email = env.INITIAL_TEACHER_EMAIL.toLowerCase();
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return "exists";

  try {
    await db.user.create({
      data: {
        role: "TEACHER",
        email,
        name: env.INITIAL_TEACHER_NAME,
        passwordHash: await hashPassword(env.INITIAL_TEACHER_PASSWORD),
        status: "ACTIVE",
        teacherProfile: { create: { role: "OWNER" } },
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return "exists";
    throw err;
  }
  console.info("[bootstrap] initial teacher account created");
  return "created";
}
