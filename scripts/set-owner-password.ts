// Sets a new password for the existing owner account. Changes only that account's password hash,
// clears its lockout, and signs out its other sessions. Nothing else is modified.
//
// Usage (PowerShell):
//   $env:NEW_OWNER_PASSWORD = "your-new-password"
//   node --env-file=.env --import tsx scripts/set-owner-password.ts owner@example.com --confirm
//   Remove-Item Env:NEW_OWNER_PASSWORD
//
// The password is read from the environment, not the command line, so it stays out of shell history.
import { db } from "@/lib/db";
import { normalizeBdPhone } from "@/lib/phone";
import { hashPassword } from "@/lib/auth/password";

async function main(): Promise<void> {
  const phone = normalizeBdPhone(process.argv[2] ?? "");
  const confirmed = process.argv.includes("--confirm");
  const password = process.env.NEW_OWNER_PASSWORD ?? "";

  if (!phone) throw new Error("Give the owner's phone address as the first argument.");
  if (!confirmed) {
    throw new Error(`This changes the password of ${phone}. Re-run with --confirm to proceed.`);
  }
  if (password.length < 8) throw new Error("Set NEW_OWNER_PASSWORD to a password of at least 8 characters.");

  const owner = await db.user.findFirst({
    where: { phoneE164: phone, role: "TEACHER", teacherProfile: { role: "OWNER" } },
    select: { id: true },
  });
  if (!owner) throw new Error(`No owner account exists with the phone ${phone}.`);

  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: owner.id },
      data: { passwordHash, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
    });
    await tx.session.updateMany({ where: { userId: owner.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({
      data: { actorId: owner.id, action: "owner.password_reset_cli", entityType: "user", entityId: owner.id },
    });
  });
  console.log(`Password updated for ${phone}. Other sessions were signed out. Sign in with the new password.`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : "Failed.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
