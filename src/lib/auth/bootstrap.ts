import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hashPassword } from "./password";
import { isUniqueViolation } from "@/lib/errors";

/**
 * Creates the initial owner account from environment variables when it does not exist.
 * An existing account keeps its password. If it has no phone number yet (created before phone sign-in),
 * the phone number from .env is saved once so the owner can sign in with it.
 * The password is never logged.
 */
export async function ensureInitialTeacher(): Promise<"created" | "exists" | "skipped"> {
  const env = getEnv();
  if (!env.INITIAL_TEACHER_PHONE || !env.INITIAL_TEACHER_PASSWORD) return "skipped";
  const phoneE164 = env.INITIAL_TEACHER_PHONE;

  const owner = await db.user.findFirst({
    where: { role: "TEACHER", teacherProfile: { role: "OWNER" }, deletedAt: null },
    select: { id: true, phoneE164: true },
  });
  if (owner) {
    if (!owner.phoneE164) {
      try {
        await db.user.update({ where: { id: owner.id }, data: { phoneE164 } });
        console.info("[bootstrap] owner phone number saved from INITIAL_TEACHER_PHONE");
      } catch (err) {
        if (isUniqueViolation(err)) return "exists";
        throw err;
      }
    }
    return "exists";
  }

  const taken = await db.user.findUnique({ where: { phoneE164 }, select: { id: true } });
  if (taken) return "exists";

  try {
    await db.user.create({
      data: {
        role: "TEACHER",
        phoneE164,
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
