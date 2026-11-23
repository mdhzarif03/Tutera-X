import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import {
  canAdjust,
  overdrawnBy,
  remainingCredits,
  settlementPlan,
  type AllowanceState,
} from "./allowance-math";

/**
 * Per-teacher SMS allowance (credits = segments). Separate from the shared Nishchit balance.
 *
 * Lifecycle of one recipient's credits:
 *   queued    -> reserved  (smsCreditsReserved += reservation; recipient.reservedCredits = reservation)
 *   accepted  -> settled   (reserved -= reservation; used += billed; any billed amount above the
 *                           reservation is also recorded as OVERAGE)
 *   failed    -> released  (reserved -= reservation; nothing used)
 *   refunded  -> provider refund after acceptance (used -= billed)
 * Every movement writes an SmsAllowanceEntry, so the ledger reconciles with the counters.
 */

type Tx = Prisma.TransactionClient;

export async function readAllowance(tx: Tx, teacherId: string): Promise<AllowanceState & { remaining: number; overdrawn: number }> {
  const row = await tx.teacherProfile.findUnique({
    where: { userId: teacherId },
    select: { smsAllowance: true, smsCreditsUsed: true, smsCreditsReserved: true },
  });
  if (!row) throw new UserError("Teacher profile not found.");
  const state = { allowance: row.smsAllowance, used: row.smsCreditsUsed, reserved: row.smsCreditsReserved };
  return { ...state, remaining: remainingCredits(state), overdrawn: overdrawnBy(state) };
}

/** Atomically reserves credits. The conditional UPDATE takes a row lock, so concurrent reservations serialize. */
export async function reserveCredits(tx: Tx, teacherId: string, credits: number): Promise<boolean> {
  if (credits <= 0) return true;
  const affected = await tx.$executeRaw`
    UPDATE "TeacherProfile"
       SET "smsCreditsReserved" = "smsCreditsReserved" + ${credits}
     WHERE "userId" = ${teacherId}
       AND "smsCreditsUsed" + "smsCreditsReserved" + ${credits} <= "smsAllowance"`;
  return affected === 1;
}

/**
 * Settles one recipient's reservation exactly once. `actual` is what Nishchit billed (null or 0
 * releases the whole reservation). Idempotent: a second call finds reservedCredits at zero.
 */
export async function settleRecipientCredits(
  tx: Tx,
  recipientId: string,
  actual: number | null,
): Promise<{ consumed: number; overage: number } | null> {
  const r = await tx.smsRecipient.findUnique({
    where: { id: recipientId },
    select: { reservedCredits: true, smsMessage: { select: { teacherId: true } } },
  });
  if (!r || r.reservedCredits <= 0) return null;

  const claimed = await tx.smsRecipient.updateMany({
    where: { id: recipientId, reservedCredits: { gt: 0 } },
    data: { reservedCredits: 0 },
  });
  if (claimed.count !== 1) return null;

  const teacherId = r.smsMessage.teacherId;
  if (!teacherId) return null; // platform messages are not charged to a teacher

  const plan = settlementPlan(r.reservedCredits, actual ?? 0);
  const affected = await tx.$executeRaw`
    UPDATE "TeacherProfile"
       SET "smsCreditsReserved" = "smsCreditsReserved" - ${plan.releasedReserved},
           "smsCreditsUsed" = "smsCreditsUsed" + ${plan.consumed}
     WHERE "userId" = ${teacherId}
       AND "smsCreditsReserved" >= ${plan.releasedReserved}`;
  if (affected !== 1) throw new Error("Allowance invariant violated: reservation missing.");

  await tx.smsAllowanceEntry.create({
    data: { teacherId, kind: "RELEASE", credits: plan.releasedReserved, smsRecipientId: recipientId, note: "reservation settled" },
  });
  if (plan.consumed > 0) {
    await tx.smsAllowanceEntry.create({
      data: { teacherId, kind: "CONSUME", credits: plan.consumed, smsRecipientId: recipientId, note: "billed by provider" },
    });
  }
  if (plan.overage > 0) {
    await tx.smsAllowanceEntry.create({
      data: {
        teacherId,
        kind: "OVERAGE",
        credits: plan.overage,
        smsRecipientId: recipientId,
        note: "provider billed more than the reservation; allowance is overdrawn until the owner adds credits",
      },
    });
    console.warn("[allowance] provider billed above the reservation. Overage credits:", plan.overage);
  }
  return { consumed: plan.consumed, overage: plan.overage };
}

/** Releases a reservation for a recipient that will never be sent. */
export async function releaseUnsent(recipientId: string): Promise<void> {
  await db.$transaction((tx) => settleRecipientCredits(tx, recipientId, null));
}

/** Returns credits the provider refunded after accepting a message that later failed. */
export async function refundProviderCredits(tx: Tx, recipientId: string): Promise<void> {
  const r = await tx.smsRecipient.findUnique({
    where: { id: recipientId },
    select: { credits: true, smsMessage: { select: { teacherId: true } } },
  });
  const credits = r?.credits ?? 0;
  const teacherId = r?.smsMessage.teacherId;
  if (!teacherId || credits <= 0) return;

  const affected = await tx.$executeRaw`
    UPDATE "TeacherProfile"
       SET "smsCreditsUsed" = "smsCreditsUsed" - ${credits}
     WHERE "userId" = ${teacherId}
       AND "smsCreditsUsed" >= ${credits}`;
  if (affected !== 1) throw new Error("Allowance invariant violated: refund exceeds usage.");
  await tx.smsAllowanceEntry.create({
    data: { teacherId, kind: "RELEASE", credits, smsRecipientId: recipientId, note: "provider refund after failure" },
  });
}

/**
 * Owner-only. A positive delta grants credits; a negative delta reduces the allowance, but never
 * below the credits already used or reserved.
 */
export async function adjustAllowance(actorId: string, teacherId: string, delta: number, note: string | null): Promise<void> {
  await db.$transaction(async (tx) => {
    const actor = await tx.teacherProfile.findUnique({ where: { userId: actorId }, select: { role: true } });
    if (actor?.role !== "OWNER") throw new UserError("Only the owner can change SMS allowances.");

    const target = await tx.teacherProfile.findUnique({
      where: { userId: teacherId },
      select: { smsAllowance: true, smsCreditsUsed: true, smsCreditsReserved: true },
    });
    if (!target) throw new UserError("Teacher not found.");
    const state = { allowance: target.smsAllowance, used: target.smsCreditsUsed, reserved: target.smsCreditsReserved };
    if (!canAdjust(state, delta)) {
      throw new UserError("That change would drop the allowance below the credits already used or reserved.");
    }

    const affected = await tx.$executeRaw`
      UPDATE "TeacherProfile"
         SET "smsAllowance" = "smsAllowance" + ${delta}
       WHERE "userId" = ${teacherId}
         AND "smsCreditsUsed" + "smsCreditsReserved" <= "smsAllowance" + ${delta}
         AND "smsAllowance" + ${delta} >= 0`;
    if (affected !== 1) throw new UserError("The allowance changed while you were editing. Try again.");

    await tx.smsAllowanceEntry.create({
      data: { teacherId, kind: delta > 0 ? "GRANT" : "ADJUST", credits: Math.abs(delta), actorId, note },
    });
    await audit(tx, { actorId, action: "sms.allowance", entityType: "teacher", entityId: teacherId, changes: { delta } });
  });
}

export async function allowanceSummary(teacherId: string) {
  const row = await db.teacherProfile.findUnique({
    where: { userId: teacherId },
    select: { smsAllowance: true, smsCreditsUsed: true, smsCreditsReserved: true },
  });
  if (!row) return null;
  const state = { allowance: row.smsAllowance, used: row.smsCreditsUsed, reserved: row.smsCreditsReserved };
  return { ...state, remaining: remainingCredits(state), overdrawn: overdrawnBy(state) };
}

export async function allowanceLedger(teacherId: string, take = 30) {
  return db.smsAllowanceEntry.findMany({
    where: { teacherId },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, kind: true, credits: true, note: true, createdAt: true, actorId: true },
  });
}
