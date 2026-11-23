// Provider pricing with no provider key configured. Runs in its own process, so the env cache is clean.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";

before(() => {
  delete process.env.NISHCHIT_API_KEY;
  process.env.DATABASE_URL = "postgresql://unused/for-unit-tests";
});

describe("send quotes without a provider key", () => {
  test("falls back to the local estimate and says why", async () => {
    const { quoteSend } = await import("@/lib/sms/pricing");
    const q = await quoteSend("Hello", 3);
    assert.equal(q.source, "local");
    assert.equal(q.reason, "provider_not_configured");
    assert.equal(q.encoding, "gsm7");
    assert.equal(q.creditsPerMessage, 1);
    assert.equal(q.totalCredits, 3);
  });

  test("zero recipients cost nothing and make no provider call", async () => {
    const { quoteSend } = await import("@/lib/sms/pricing");
    const q = await quoteSend("Hello", 0);
    assert.equal(q.totalCredits, 0);
    assert.equal(q.reason, undefined);
  });

  test("a Bangla body is priced with the platform prefix counted", async () => {
    const { quoteSend } = await import("@/lib/sms/pricing");
    // 70 Bangla characters plus the 11-character "[Tutera-X] " prefix is 81 UCS-2 units: two segments.
    const q = await quoteSend("ক".repeat(70), 1);
    assert.equal(q.encoding, "ucs2");
    assert.equal(q.creditsPerMessage, 2);
  });
});

describe("provider pricing response validation", () => {
  test("accepts a well-formed response", async () => {
    const { parseProviderPreview } = await import("@/lib/sms/pricing");
    const p = parseProviderPreview({ encoding: "ucs2", characters: 16, segments: 1, credits_per_message: 1, total_credits: 1200 });
    assert.equal(p.total_credits, 1200);
  });

  test("rejects negative, fractional, missing and unknown values", async () => {
    const { parseProviderPreview } = await import("@/lib/sms/pricing");
    const good = { encoding: "gsm7", characters: 5, segments: 1, credits_per_message: 1, total_credits: 1 };
    assert.throws(() => parseProviderPreview({ ...good, total_credits: -1 }));
    assert.throws(() => parseProviderPreview({ ...good, segments: 1.5 }));
    assert.throws(() => parseProviderPreview({ ...good, encoding: "utf-7" }));
    assert.throws(() => parseProviderPreview({ encoding: "gsm7" }));
    assert.throws(() => parseProviderPreview(null));
  });
});
