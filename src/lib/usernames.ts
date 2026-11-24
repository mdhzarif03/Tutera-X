import type { Prisma } from "@prisma/client";

const FIRST_USERNAME_NUMBER = 1001n;
const USERNAME_SEQUENCE_LOCK = 7_126_032_841_003n;

export function usernamePrefix(name: string): string {
  const nameParts = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .match(/[A-Z]+/g);
  const firstName = nameParts?.find((part) => part !== "MD") ?? nameParts?.[0];
  return firstName?.slice(0, 2).padEnd(2, "X") ?? "ST";
}

export function usernameCandidate(prefix: string, sequence: bigint): string {
  return `${prefix}-${sequence.toString().padStart(4, "0")}`;
}

export async function nextUsername(
  tx: Prisma.TransactionClient,
  name: string,
): Promise<string> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${USERNAME_SEQUENCE_LOCK})`;
  const rows = await tx.$queryRaw<Array<{ maxSequence: bigint | null }>>`
    SELECT MAX(SUBSTRING("username" FROM 4)::BIGINT) AS "maxSequence"
    FROM "User"
    WHERE "username" ~ '^[A-Z]{2}-[0-9]+$'
  `;
  const sequence = (rows[0]?.maxSequence ?? FIRST_USERNAME_NUMBER - 1n) + 1n;
  return usernameCandidate(usernamePrefix(name), sequence);
}
