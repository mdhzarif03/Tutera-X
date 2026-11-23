# Tutera-X: Architecture Decisions

Status: Step 1 (inspection and design). No application code has been written yet.

## 1. Environment findings

- Sandbox: Ubuntu 24.04, Node 22.23, npm 10.9, Python 3.12.
- No outbound network from the shell. `npm install`, `prisma generate`, `prisma validate`, and `next build` cannot run here.
- No PostgreSQL server in the sandbox, so migrations and database tests cannot run here.
- Consequence: everything in this step is design and static artifacts. Verification (install, typecheck, lint, build, test, migrate) must run on a machine with network access and a Postgres instance. The steps are listed in the implementation plan.

## 2. Nishchit API, verified against nishchit.tech

Sources checked: the homepage, `/openapi.json` (truncated in the fetch, so the balance and send schemas were read from the docs), and `/llms-full.txt` (also truncated, at the errors page).

Confirmed:

- Base URL `https://api.nishchit.tech`, bearer auth `Authorization: Bearer nk_live_…` or `nk_test_…`.
- `POST /v1/messages` with `to` (E.164, `+8801[3-9]` + 8 digits), `body`, optional `from`, `callback_url`, `reference`. Returns 201 with `id` (`msg_…`), `status` (`accepted|sending|sent|failed`), `delivery_status` (`unknown|delivered|undelivered|rejected`), `segments`, `encoding`, `credits`, and `error`.
- `Idempotency-Key` header: 24-hour replay, same key with a different body returns 409, in-flight duplicate returns 409 with Retry-After.
- `GET /v1/balance` returns `{ object, credits, currency, as_of }`. Matches the spec.
- `GET /v1/messages/{id}`, cursor-based list, `POST /v1/messages/batch` (max 1,000 rows, 202).
- `POST /v1/pricing/preview` returns encoding, segments and credits for a body and recipient count. Use it for SMS cost estimates.
- Webhooks: `Nishchit-Signature: t=…,v1=…` with HMAC-SHA256 over `${t}.${rawBody}`, 5-minute tolerance. Events include `message.accepted|sent|failed|delivered|undelivered`.
- Errors: a stable `error.code`, `doc_url`, `request_id`. Codes seen: `authentication_failed`, `invalid_recipient`, `unsupported_country`, `invalid_sender`, `insufficient_credits`, `idempotency_conflict`, `content_rejected` (422, not charged), `rate_limit_exceeded`, `daily_quota_exceeded`, `gateway_unavailable` (503), `email_unverified`, `project_suspended`.

Constraints that change the Tutera-X design:

| # | Nishchit fact | Impact on Tutera-X | Decision |
|---|---|---|---|
| N1 | The primary Bangladesh route provides no delivery receipts. `delivery_status` stays `unknown` permanently. | The spec's "delivered" tracking cannot be shown for most SMS. | `SmsRecipient.deliveryStatus` defaults to UNKNOWN. UI shows "Sent to network" and never "Delivered" unless a report exists. Retries key off FAILED only. |
| N2 | One credit = one segment. Bangla is UCS-2: 70 chars per segment, 67 when split. | A Bangla notice costs about 3x English. | Templates default to English. Show segments and credits before each bulk send using `/v1/pricing/preview`. |
| N3 | Every message is prefixed with the account's SMS prefix in brackets, and the prefix is counted toward segments. | Tutera-X sends all teacher messages from one Nishchit account, so every message carries one prefix. | Platform prefix `Tutera-X` (8 chars, GSM-7). Teacher names go in the body as the signature. |
| N4 | Trust tiers. A new project is capped at 50 messages/day and 20 distinct recipients/day. Promotional messages are blocked on `new`. Links on `new` are flagged for review. | A bulk send to a batch of 40 guardians fails on day one. | Operator action required (see §6). Platform code must surface `daily_quota_exceeded` and queue remaining recipients for the next day, not fail them. |
| N5 | Live sending requires a verified email. Until the first top-up, live messages go only to the owner's verified mobile. | Activation SMS to real students will fail until the account is topped up. | The owner tops up before the first live send. `ALLOW_LIVE_SMS` stays false in dev. |
| N6 | Content Guard blocks credential requests and phishing patterns (e.g. "reply with your password"). Shorteners are blocked. Links are flagged on `new` tier. | Activation wording must not ask the student to send a password. Use a link on our own domain. | Activation template: "Set your Tutera-X password: {link}". Test this wording with a test key before enabling live. |
| N7 | Message bodies are retained for 12 months, then redacted. | Bodies may contain student names, exam dates and marks. | Store rendered bodies only as long as needed for support. Document this in the privacy notice. Do not put marks in SMS bodies beyond what the spec requires. |
| N8 | Nishchit requires an unverifiable number to be rejected. Phone numbers outside Bangladesh are rejected. | Tutera-X is Bangladesh-focused, so this matches. | Store E.164. Reject non-BD numbers at validation with a clear teacher-facing message. |

Open verification items, to close during Phase 4 with a test key:

- The full error list for the `/v1/balance` path, and whether `balance` returns anything beyond the four documented fields.
- Exact rate-limit response headers.
- Whether a `callback_url` on a message is needed at all. Tutera-X will use registered webhook endpoints instead, so that the signature can be verified with the platform secret.

## 3. Product and platform decisions

1. **Single platform Nishchit account, not one per teacher.** Each Nishchit account requires email verification, a manual bKash top-up, and its own trust tier. Per-teacher accounts would multiply that work and make the Tutera-X prefix impossible to share. Teachers get a credit allowance tracked in Tutera-X's own ledger, and the platform balance is shown from `/v1/balance`. The spec's "teacher sees the Nishchit balance" is implemented as: the platform balance is visible to the platform owner, and each teacher sees their own allowance and usage.

2. **Teacher-scoped data, enforced at the query layer.** Every query for teacher-owned data takes the authenticated teacher id from the session and filters by it. No client-supplied owner id is trusted. Student and parent queries filter by the student or guardian linked to the session user.

3. **Students belong to a teacher through `TeacherStudent`.** A student can be linked to several teachers. The batch membership is separate (`BatchStudent`). Attendance and results are per batch or exam, and both are visible to the teacher who owns that batch or exam.

4. **Guardian identity is the phone number.** `Guardian.phoneE164` is unique. A guardian with two children is one Guardian row linked to two `StudentProfile` rows. A parent login is a `ParentProfile` linked to one Guardian.

5. **Money is a ledger.** Monthly `FeeCharge` rows (unique per student and period), `Payment` rows (append-only), and `PaymentAdjustment` rows (signed). Balance = charges + adjustments − payments, computed in SQL inside a transaction. No stored balance column.

6. **Results are versioned.** `ExamResult` holds the current value. Every change writes `ExamResultRevision`. `totalMarksSnapshot` freezes the denominator at entry time.

7. **Notifications are database jobs.** `NotificationJob` rows are claimed with a lock timestamp (`lockedUntil`) using `UPDATE … WHERE status = PENDING AND runAfter <= now() RETURNING`. Workers are stateless. A crashed claim expires after its lock window. This survives restarts and multiple instances.

8. **Idempotency is layered.** Each `SmsRecipient` has a unique `idempotencyKey` sent as the `Idempotency-Key` header. Each logical notice has a unique `SmsMessage.dedupeKey` (for example `absence:{attendanceId}`), so a repeated submit creates no new rows.

9. **Attendance SMS is sent after commit.** The attendance transaction writes `Attendance` and `AttendanceChangeLog`, and inserts a `NotificationJob` in the same transaction. The worker sends after commit. If Nishchit is down, attendance is kept and the job retries.

10. **Correcting an absence.** Changing ABSENT to PRESENT does not send a message. A later change back to ABSENT sends a new notice only if `absenceNoticeSent` is false for that record. Corrections are audited.

## 4. Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 15.5.29 (App Router) | Route handlers for `/api/*`. Server components for dashboards. |
| UI | React 19, TypeScript (strict) | `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` on. |
| Styling | Tailwind CSS v4 | Design tokens in CSS variables. |
| Database | PostgreSQL 16 | |
| ORM | Prisma 6 | Migrations only in production (`migrate deploy`). |
| Validation | Hand-written validators (`src/lib/validate.ts`, `src/lib/env.ts`) | Zod was removed to keep dependencies minimal. |
| Password hashing | Argon2id via `@node-rs/argon2` | Native binding. Verify the build target supports it. |
| Icons | Lucide React | |
| Tests | node:test run through tsx; PostgreSQL integration suite gated on TEST_DATABASE_URL | Nishchit is never called from tests. Playwright E2E is not yet written. |
| Lint | ESLint with `next/core-web-vitals` and `@typescript-eslint` | |

Versions are pinned exactly in `package.json` during Phase 2, after a live `npm view` check on a machine with network access.

## 5. Module layout

```
src/
  app/
    (auth)/login, activate, reset, accept-invite
    (teacher)/     teacher dashboard and pages
    (student)/     student dashboard (mobile-first)
    (parent)/      parent dashboard
    api/           route handlers (thin: parse, authorize, call service, return)
  lib/
    auth/          password hashing, sessions, CSRF, login throttling
    permissions/   role and ownership guards, used by every service
    db/            Prisma client singleton
    env/           Validated environment; fails fast in production
    sms/           nishchit.ts (HTTP client), service.ts, validation.ts, segmentation.ts, types.ts
    jobs/          claim, run, retry, dead-letter for NotificationJob
    audit/         audit writer (no secrets, no full phone numbers)
    money/         ledger calculations
    validation/    shared validators
  services/        domain operations: students, batches, attendance, exams, payments, communications
  components/      ui, shared, teacher, student, parent
prisma/
  schema.prisma
  migrations/
```

Rules:

- Route handlers never touch Prisma directly. They call a service.
- Services take an `Actor` (user id and role) and authorize every operation themselves.
- Only `lib/sms/nishchit.ts` reads `NISHCHIT_API_KEY`. It is imported only from server code.
- `lib/env` is the only place that reads `process.env`.

## 6. Actions required from the operator (cannot be done in code)

These are not blockers for building, but they are required before live use:

1. Create a Nishchit account with the owner email, verify it, and top up with bKash (minimum ৳20).
2. Create a `nk_test_` key for development and a `nk_live_` key for production. Store only in the environment.
3. Request a higher trust tier from Nishchit if the first bulk send will exceed 20 distinct recipients per day.
4. Confirm the platform SMS prefix `Tutera-X` is accepted, since prefixes are checked for uniqueness and protected names.
5. Register a production webhook endpoint with a signing secret.

## 7. Security baseline

- Argon2id for passwords, with parameters tuned at build time and the hash stored with its parameters.
- Session cookies: HttpOnly, Secure in production, SameSite=Lax. Only SHA-256 of the token is stored.
- CSRF token on every mutating request, checked server-side.
- Login throttling per account and per IP, with lockout after repeated failures.
- Activation, invitation, and reset tokens: 32 random bytes, SHA-256 at rest, short expiry, single use.
- Authorization in every service call. UI hiding is never the control.
- Audit log on: student create or edit, batch membership, attendance commit or change, exam result entry or publish, payment record or adjustment, SMS send, teacher invite, role change.
- No secrets, tokens, passwords or full phone numbers in logs or audit payloads.
- Dependency audit (`npm audit`) in CI.

## 8. Known risks

- The 20-recipient daily cap (N4) may delay the first bulk send. Mitigated by queueing and by the operator action in §6.
- No delivery confirmation on the primary route (N1). Expect teachers to ask "did it arrive". The UI must say what is known.
- The shared prefix means a teacher cannot see their own name on the sender line. The body signature mitigates this.
- Argon2 native binding may fail on some platforms. Fallback is a documented pure-JS alternative, decided during Phase 2.
