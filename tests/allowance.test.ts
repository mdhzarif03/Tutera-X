// Allowance arithmetic and settlement policy. Pure functions only.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canAdjust, canReserve, overdrawnBy, parseCreditAmount, remainingCredits, settlementPlan } from "@/lib/sms/allowance-math";

describe("allowance arithmetic", () => {
  test("remaining credits never go negative", () => {
    assert.equal(remainingCredits({ allowance: 100, used: 60, reserved: 30 }), 10);
    assert.equal(remainingCredits({ allowance: 10, used: 60, reserved: 30 }), 0);
  });

  test("overdrawn only counts used plus reserved above the allowance", () => {
    assert.equal(overdrawnBy({ allowance: 10, used: 8, reserved: 2 }), 0);
    assert.equal(overdrawnBy({ allowance: 10, used: 9, reserved: 4 }), 3);
  });

  test("reservations stop exactly at the allowance", () => {
    const s = { allowance: 10, used: 4, reserved: 0 };
    assert.equal(canReserve(s, 6), true);
    assert.equal(canReserve(s, 7), false);
    assert.equal(canReserve({ ...s, reserved: 6 }, 1), false);
  });

  test("a negative or fractional reservation is never allowed", () => {
    assert.equal(canReserve({ allowance: 5, used: 0, reserved: 0 }, -1), false);
    assert.equal(canReserve({ allowance: 5, used: 0, reserved: 0 }, 1.5), false);
  });

  test("the allowance cannot be reduced below what is used or reserved", () => {
    const s = { allowance: 100, used: 40, reserved: 20 };
    assert.equal(canAdjust(s, -40), true);
    assert.equal(canAdjust(s, -41), false);
    assert.equal(canAdjust(s, 500), true);
    assert.equal(canAdjust(s, 0), false);
  });

  test("a sequence of reservations never overspends", () => {
    let state = { allowance: 50, used: 0, reserved: 0 };
    let accepted = 0;
    for (let i = 0; i < 100; i++) {
      if (canReserve(state, 1)) {
        state = { ...state, reserved: state.reserved + 1 };
        accepted++;
      }
    }
    assert.equal(accepted, 50);
    assert.ok(state.used + state.reserved <= state.allowance);
  });

  test("owner input must be a whole number", () => {
    assert.equal(parseCreditAmount("500"), 500);
    assert.equal(parseCreditAmount("-100"), -100);
    assert.throws(() => parseCreditAmount("1.5"));
    assert.throws(() => parseCreditAmount("abc"));
    assert.throws(() => parseCreditAmount("9999999"));
  });
});

describe("settlement policy", () => {
  test("a bill below the reservation releases the difference and records no overage", () => {
    assert.deepEqual(settlementPlan(3, 2), { releasedReserved: 3, consumed: 2, overage: 0 });
  });

  test("a bill equal to the reservation releases everything and consumes everything", () => {
    assert.deepEqual(settlementPlan(2, 2), { releasedReserved: 2, consumed: 2, overage: 0 });
  });

  test("a bill above the reservation is consumed in full and the excess is recorded as overage", () => {
    // Reserved 1 but Nishchit billed 4. The provider has already charged all 4, so all 4 are used.
    assert.deepEqual(settlementPlan(1, 4), { releasedReserved: 1, consumed: 4, overage: 3 });
  });

  test("a failed or unsent message (billed 0) releases the whole reservation", () => {
    assert.deepEqual(settlementPlan(5, 0), { releasedReserved: 5, consumed: 0, overage: 0 });
  });

  test("negative or fractional inputs are normalised, never turned into credits", () => {
    assert.deepEqual(settlementPlan(-2, -5), { releasedReserved: 0, consumed: 0, overage: 0 });
    assert.deepEqual(settlementPlan(2.9, 3.4), { releasedReserved: 2, consumed: 3, overage: 1 });
  });
});
