// Unit tests for pure modules. They do not touch the database, the network, or native packages.
// Run with: npm test   (node --import tsx --test)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { normalizeBdPhone, looksLikePhone } from "@/lib/phone";
import { analyzeSms } from "@/lib/sms/segments";
import { nextDhakaMidnight, dhakaToday, dateOnly, dhakaPeriod } from "@/lib/dates";
import { verifyNishchitSignature } from "@/lib/sms/webhook";
import { render, templates, PLATFORM_PREFIX } from "@/lib/sms/templates";
import { requireNumber, requireText } from "@/lib/validate";
import { assertPasswordPolicy } from "@/lib/auth/policy";
import { UserError, isUniqueViolation } from "@/lib/errors";
import { round2, num } from "@/lib/money";

describe("phone normalisation", () => {
  test("accepts the common Bangladesh forms", () => {
    assert.equal(normalizeBdPhone("01712345678"), "+8801712345678");
    assert.equal(normalizeBdPhone("8801712345678"), "+8801712345678");
    assert.equal(normalizeBdPhone("+880 17-1234 5678"), "+8801712345678");
  });
  test("rejects unassigned operator digits and foreign numbers", () => {
    assert.throws(() => normalizeBdPhone("01212345678"), UserError);
    assert.throws(() => normalizeBdPhone("+919812345678"), UserError);
  });
  test("recognises phone-shaped login identifiers", () => {
    assert.equal(looksLikePhone("01712345678"), true);
    assert.equal(looksLikePhone("S483920"), false);
  });
});

describe("SMS segmentation", () => {
  test("plain English is GSM-7 and one segment", () => {
    const a = analyzeSms("Hello world");
    assert.equal(a.encoding, "gsm7");
    assert.equal(a.segments, 1);
  });
  test("one Bangla character switches the whole message to UCS-2", () => {
    const a = analyzeSms("Hello ক");
    assert.equal(a.encoding, "ucs2");
    assert.equal(a.singleLimit, 70);
  });
  test("GSM-7 splits at 160, then 153 per segment", () => {
    assert.equal(analyzeSms("a".repeat(160)).segments, 1);
    assert.equal(analyzeSms("a".repeat(161)).segments, 2);
    assert.equal(analyzeSms("a".repeat(307)).segments, 3);
  });
  test("extension characters count as two septets", () => {
    assert.equal(analyzeSms("€".repeat(80)).units, 160);
  });
  test("UCS-2 splits at 70, then 67 per segment", () => {
    assert.equal(analyzeSms("ক".repeat(70)).segments, 1);
    assert.equal(analyzeSms("ক".repeat(71)).segments, 2);
  });
  test("an empty body is zero segments", () => {
    assert.equal(analyzeSms("").segments, 0);
  });
});

describe("Dhaka time", () => {
  test("next Dhaka midnight is an absolute instant", () => {
    // 2026-11-22 20:00 Dhaka = 14:00 UTC. Next midnight = 2026-11-22 18:00 UTC.
    assert.equal(nextDhakaMidnight(new Date("2026-11-22T14:00:00.000Z")).toISOString(), "2026-11-22T18:00:00.000Z");
  });
  test("uses the Dhaka calendar day, not UTC", () => {
    // 01:00 Dhaka on 22 Nov is still 19:00 UTC on 21 Nov.
    assert.equal(dhakaToday(new Date("2026-11-21T19:00:00.000Z")), "2026-11-22");
    assert.equal(dhakaPeriod(new Date("2026-11-21T19:00:00.000Z")), "2026-11");
  });
  test("rejects impossible calendar dates", () => {
    assert.throws(() => dateOnly("2026-02-30"), UserError);
    assert.throws(() => dateOnly("22/11/2026"), UserError);
    assert.equal(dateOnly("2026-11-22").toISOString(), "2026-11-22T00:00:00.000Z");
  });
});

describe("Nishchit webhook signature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ type: "message.sent", data: { message_id: "msg_x" } });
  const now = 1_780_000_000;
  const sign = (t: number, b: string) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${b}`).digest("hex")}`;

  test("accepts a correctly signed, fresh payload", () => {
    assert.equal(verifyNishchitSignature(body, sign(now, body), secret, now), true);
  });
  test("rejects a tampered body", () => {
    assert.equal(verifyNishchitSignature(body + " ", sign(now, body), secret, now), false);
  });
  test("rejects a replay outside the five-minute window", () => {
    assert.equal(verifyNishchitSignature(body, sign(now - 301, body), secret, now), false);
  });
  test("rejects a wrong secret and a malformed header", () => {
    assert.equal(verifyNishchitSignature(body, sign(now, body), "other", now), false);
    assert.equal(verifyNishchitSignature(body, "garbage", secret, now), false);
  });
});

describe("templates and validation", () => {
  test("renders named placeholders and blanks unknown ones", () => {
    assert.equal(
      render(templates.absence, { student: "Rahim", batch: "A", date: "22 Nov 2026", teacher: "Hasan" }),
      "Dear Guardian, your child Rahim was marked absent from A on 22 Nov 2026. - Hasan",
    );
    assert.equal(render("Hi {x}", {}), "Hi ");
  });
  test("the platform prefix is the documented account prefix", () => {
    assert.equal(PLATFORM_PREFIX, "Tutera-X");
  });
  test("validates numbers and required text", () => {
    assert.equal(requireNumber("500", "Fee", 0, 1000), 500);
    assert.throws(() => requireNumber("abc", "Fee", 0, 1000), UserError);
    assert.throws(() => requireNumber("2000", "Fee", 0, 1000), UserError);
    assert.throws(() => requireText("   ", "Name"), UserError);
  });
  test("enforces the password policy", () => {
    assert.throws(() => assertPasswordPolicy("short"), UserError);
    assert.doesNotThrow(() => assertPasswordPolicy("long-enough"));
  });
});

describe("money and errors", () => {
  test("rounds to two decimals and converts decimals to numbers", () => {
    assert.equal(round2(10.004 + 0.1), 10.1);
    assert.equal(round2(10.006), 10.01);
    assert.equal(num(null), 0);
    assert.equal(num({ toString: () => "12.50" }), 12.5);
  });
  test("detects Prisma unique-constraint violations", () => {
    assert.equal(isUniqueViolation({ code: "P2002" }), true);
    assert.equal(isUniqueViolation(new Error("boom")), false);
  });
});
