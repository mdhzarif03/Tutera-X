// Read-only. Prints the status of the owner account with the given email. Changes nothing, and never
// prints the password or its hash.
//
// Usage:  npm run owner:check -- owner@example.com
import { db } from "@/lib/db";

async function main(): Promise<void> {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) throw new Error("Give the email address as the first argument.");

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      name: true,
      status: true,
      passwordHash: true,
      failedLoginCount: true,
      lockedUntil: true,
      lastLoginAt: true,
      deletedAt: true,
      createdAt: true,
      teacherProfile: { select: { role: true } },
    },
  });

  if (!user) {
    console.log(`No user has the email ${email}.`);
    return;
  }
  console.log(`User found for ${email}`);
  console.log(`  name: ${user.name}`);
  console.log(`  role: ${user.role}, teacher role: ${user.teacherProfile?.role ?? "none"}`);
  console.log(`  status: ${user.status}${user.deletedAt ? " (deleted)" : ""}`);
  console.log(`  has a password set: ${user.passwordHash ? "yes" : "no"}`);
  console.log(`  failed sign-ins in a row: ${user.failedLoginCount}`);
  console.log(`  locked until: ${user.lockedUntil ? user.lockedUntil.toISOString() : "not locked"}`);
  console.log(`  last sign-in: ${user.lastLoginAt ? user.lastLoginAt.toISOString() : "never"}`);
  console.log(`  created: ${user.createdAt.toISOString()}`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : "Failed.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
