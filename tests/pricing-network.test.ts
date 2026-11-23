// A configured but unreachable provider must fall back to the local estimate, and say so.
// Points at a closed local port, so this makes a real failed network call and no external request.
import { test, before } from "node:test";
import assert from "node:assert/strict";

before(() => {
  process.env.DATABASE_URL = "postgresql://unused/for-unit-tests";
  process.env.NISHCHIT_API_KEY = "nk_test_unit_example";
  process.env.NISHCHIT_API_BASE_URL = "http://127.0.0.1:9";
});

test("an unreachable provider falls back to the local estimate with a stable reason", async () => {
  const { quoteSend } = await import("@/lib/sms/pricing");
  const q = await quoteSend("Hi", 2);
  assert.equal(q.source, "local");
  assert.equal(q.totalCredits, 2);
  assert.ok(q.reason === "network_error" || q.reason === "timeout", `unexpected reason: ${q.reason}`);
});
