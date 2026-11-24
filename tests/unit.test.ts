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
import { parseWhatsappLink } from "@/lib/whatsapp";
import { assertPasswordPolicy } from "@/lib/auth/policy";
import { UserError, isUniqueViolation } from "@/lib/errors";
import { round2, num } from "@/lib/money";
import { randomUsernameNumber, usernameCandidate, usernameInitials } from "@/lib/usernames";
import { retryDelayMs, smsRecipientIdFromPayload } from "@/lib/job-utils";
import { logUnexpectedError, prismaRetryReason } from "@/lib/errors";
import {
  isPasswordActionAllowed,
  PASSWORD_CHANGE_COOLDOWN_MS,
  PASSWORD_RESET_COOLDOWN_MS,
} from "@/lib/auth/password-limits";

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
  test("extracts only safe Prisma error details", () => {
    assert.equal(prismaRetryReason({ code: "P2022", meta: { column: "secret", password: "no" } }), "P2022");
    assert.equal(prismaRetryReason(new Error("private")), "internal");
  });
  test("logs safe metadata without error messages or unapproved metadata", () => {
    const original = console.error;
    let logged = "";
    console.error = (...parts: unknown[]) => { logged = parts.join(" "); };
    try {
      logUnexpectedError("[test] failed", { operation: "student.create", requestId: "req-123" }, {
        name: "PrismaClientKnownRequestError",
        code: "P2003",
        message: "private student or guardian data",
        meta: { modelName: "StudentProfile", field_name: "guardianId", password: "private" },
      });
    } finally {
      console.error = original;
    }
    assert.match(logged, /"code":"P2003"/);
    assert.match(logged, /"modelName":"StudentProfile"/);
    assert.match(logged, /"requestId":"req-123"/);
    assert.doesNotMatch(logged, /private|password/);
  });
});

describe("background job validation and retry timing", () => {
  test("accepts only a well-formed SMS recipient payload", () => {
    assert.equal(smsRecipientIdFromPayload({ smsRecipientId: "recipient-1" }), "recipient-1");
    assert.equal(smsRecipientIdFromPayload({ smsRecipientId: "" }), null);
    assert.equal(smsRecipientIdFromPayload({ smsRecipientId: 1 }), null);
    assert.equal(smsRecipientIdFromPayload(null), null);
  });

  describe("password cooldown policy", () => {
    const now = new Date("2026-11-24T00:00:00.000Z");
    test("forgot-password cooldown starts at the OTP request and opens at exactly three days", () => {
      assert.equal(isPasswordActionAllowed(null, PASSWORD_RESET_COOLDOWN_MS, now), true);
      assert.equal(
        isPasswordActionAllowed(new Date(now.getTime() - PASSWORD_RESET_COOLDOWN_MS + 1), PASSWORD_RESET_COOLDOWN_MS, now),
        false,
      );
      assert.equal(
        isPasswordActionAllowed(new Date(now.getTime() - PASSWORD_RESET_COOLDOWN_MS), PASSWORD_RESET_COOLDOWN_MS, now),
        true,
      );
    });
    test("signed-in password changes reopen after exactly seven days", () => {
      assert.equal(isPasswordActionAllowed(null, PASSWORD_CHANGE_COOLDOWN_MS, now), true);
      assert.equal(
        isPasswordActionAllowed(new Date(now.getTime() - PASSWORD_CHANGE_COOLDOWN_MS), PASSWORD_CHANGE_COOLDOWN_MS, now),
        true,
      );
      assert.equal(
        isPasswordActionAllowed(new Date(now.getTime() - PASSWORD_CHANGE_COOLDOWN_MS + 1), PASSWORD_CHANGE_COOLDOWN_MS, now),
        false,
      );
    });
  });
  test("retry delay grows exponentially and is capped", () => {
    assert.equal(retryDelayMs(1), 30_000);
    assert.equal(retryDelayMs(2), 60_000);
    assert.equal(retryDelayMs(100), 30 * 60_000);
  });
});

describe("memorable usernames", () => {
  test("uses the first letter of every name word", () => {
    assert.equal(usernameInitials("Nila Karim Noor"), "NKN");
    assert.equal(usernameInitials("Aisha de Silva"), "ADS");
    assert.equal(usernameInitials("Éva"), "E");
    assert.equal(usernameInitials("রহিম"), "র");
    assert.equal(usernameInitials("123"), "ST");
  });
  test("formats random numbers as part of the username", () => {
    assert.equal(usernameCandidate("NKN", 438_291), "NKN-438291");
    const number = randomUsernameNumber();
    assert.ok(number >= 100_000 && number < 1_000_000);
  });
});

describe("correction messages", () => {
  test("absence correction and result correction render without leftover placeholders", () => {
    const a = render(templates.absenceCorrection, { student: "Rafi", date: "23 Nov 2026", teacher: "Ms. Rahman" });
    assert.equal(a, "Dear Guardian, please ignore the absence notice for Rafi on 23 Nov 2026. It was sent in error. - Ms. Rahman");
    const r = render(templates.resultCorrection, { student: "Rafi", marks: 41, total: 50, exam: "Unit Test 3", teacher: "Ms. Rahman" });
    assert.equal(r, "Dear Guardian, a correction: Rafi got 41 out of 50 in Unit Test 3. - Ms. Rahman");
    assert.doesNotMatch(a + r, /\{\w+\}/);
  });
});

describe("message balance", () => {
  test("the balance is shown as whole short messages", async () => {
    const { shortMessagesLeft } = await import("@/lib/sms/balance");
    assert.equal(shortMessagesLeft(null), null);
    assert.equal(shortMessagesLeft(0), 0);
    assert.equal(shortMessagesLeft(12.9), 12);
    assert.equal(shortMessagesLeft(-5), 0);
  });
});

describe("student class, medium and group", () => {
  const { checkClassFields, needsGroup, CLASS_OPTIONS, VERSION_OPTIONS } = require("@/lib/student-options");
  test("the choices are exactly as agreed", () => {
    assert.deepEqual([...CLASS_OPTIONS], ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10", "Class 11", "Class 12"]);
    assert.deepEqual([...VERSION_OPTIONS], ["English Version", "English Medium", "Bangla Version"]);
  });
  test("a group is needed only for Class 9 to 12", () => {
    assert.equal(needsGroup("Class 8"), false);
    assert.equal(needsGroup("Class 9"), true);
    assert.equal(needsGroup("Class 12"), true);
  });
  test("a Class 9 to 12 student must have a group, and a Class 6 to 8 student gets none", () => {
    assert.throws(() => checkClassFields({ className: "Class 10", version: "Bangla Version", studentGroup: "" }), /group/);
    assert.deepEqual(checkClassFields({ className: "Class 10", version: "Bangla Version", studentGroup: "Science" }), { className: "Class 10", version: "Bangla Version", studentGroup: "Science" });
    assert.deepEqual(checkClassFields({ className: "Class 7", version: "English Medium", studentGroup: "Science" }), { className: "Class 7", version: "English Medium", studentGroup: null });
  });
  test("only the listed classes and media are accepted", () => {
    assert.throws(() => checkClassFields({ className: "Class 5", version: "English Medium", studentGroup: "" }), /class/);
    assert.throws(() => checkClassFields({ className: "Class 6", version: "French", studentGroup: "" }), /medium/);
  });
});


describe("WhatsApp group links", () => {
  test("empty input clears the link", () => {
    assert.equal(parseWhatsappLink(""), null);
    assert.equal(parseWhatsappLink("   "), null);
    assert.equal(parseWhatsappLink(undefined), null);
  });
  test("accepts WhatsApp invite links, with or without a scheme", () => {
    assert.equal(parseWhatsappLink("https://chat.whatsapp.com/AbC123xyz"), "https://chat.whatsapp.com/AbC123xyz");
    assert.equal(parseWhatsappLink("chat.whatsapp.com/AbC123xyz"), "https://chat.whatsapp.com/AbC123xyz");
    assert.equal(parseWhatsappLink("http://chat.whatsapp.com/AbC123xyz"), "https://chat.whatsapp.com/AbC123xyz");
    assert.equal(parseWhatsappLink(" https://wa.me/8801712345678 "), "https://wa.me/8801712345678");
  });
  test("rejects other websites, look-alike hosts and unsafe schemes", () => {
    assert.throws(() => parseWhatsappLink("https://example.com/group"), UserError);
    assert.throws(() => parseWhatsappLink("https://chat.whatsapp.com.evil.com/abc"), UserError);
    assert.throws(() => parseWhatsappLink("https://evil.com/chat.whatsapp.com/abc"), UserError);
    assert.throws(() => parseWhatsappLink("https://chat.whatsapp.com@evil.com/abc"), UserError);
    assert.throws(() => parseWhatsappLink("javascript:alert(1)"), UserError);
    assert.throws(() => parseWhatsappLink("https://chat.whatsapp.com/"), UserError);
    assert.throws(() => parseWhatsappLink("https://chat.whatsapp.com/" + "a".repeat(200)), UserError);
  });
});
