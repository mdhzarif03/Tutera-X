// Pure allowance arithmetic. The database enforces the same rules with conditional UPDATEs, so a
// concurrent request cannot overspend even if two checks run at the same moment.

export interface AllowanceState {
  allowance: number;
  used: number;
  reserved: number;
}

export function remainingCredits(s: AllowanceState): number {
  return Math.max(0, s.allowance - s.used - s.reserved);
}

/** How far used + reserved exceed the allowance. Non-zero only after a provider overage. */
export function overdrawnBy(s: AllowanceState): number {
  return Math.max(0, s.used + s.reserved - s.allowance);
}

/** Can `credits` be reserved without pushing used + reserved above the allowance? */
export function canReserve(s: AllowanceState, credits: number): boolean {
  return Number.isInteger(credits) && credits >= 0 && s.used + s.reserved + credits <= s.allowance;
}

/** Can the allowance change by `delta` while still covering credits already used or reserved? */
export function canAdjust(s: AllowanceState, delta: number): boolean {
  if (!Number.isInteger(delta) || delta === 0) return false;
  const next = s.allowance + delta;
  return next >= 0 && s.used + s.reserved <= next;
}

/**
 * Settlement policy for one accepted recipient. The reservation is released in full, and the
 * provider's billed credits are consumed in full. A bill above the reservation is an OVERAGE: it
 * is recorded explicitly and the teacher becomes overdrawn. We never refuse to record a charge the
 * provider has already made.
 */
export interface SettlementPlan {
  releasedReserved: number;
  consumed: number;
  overage: number;
}

export function settlementPlan(reserved: number, actual: number): SettlementPlan {
  const releasedReserved = Math.max(0, Math.trunc(reserved));
  const consumed = Math.max(0, Math.trunc(actual));
  return { releasedReserved, consumed, overage: Math.max(0, consumed - releasedReserved) };
}

export function parseCreditAmount(value: string, label = "Credits"): number {
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) throw new Error(`${label} must be a whole number.`);
  const n = Number(trimmed);
  if (Math.abs(n) > 1_000_000) throw new Error(`${label} is too large.`);
  return n;
}
