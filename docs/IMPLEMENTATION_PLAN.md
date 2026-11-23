# Tutera-X: Implementation Plan

Companion to `ARCHITECTURE.md` and `prisma/schema.prisma`.

## Execution environment note

Development in this sandbox is limited to writing files. Install, generate, validate, typecheck, lint, build, migrate and test steps must run on a machine with network access and PostgreSQL. Each phase lists its verification commands. A phase is complete only when its commands have been run and passed.

## Phase 0: Inventory (done in Step 1)

- [x] Sandbox checked: Node 22, npm 10, no network, no Postgres.
- [x] Nishchit documentation checked. Balance, send, idempotency, webhooks, errors, delivery model, pricing, content policy, trust tiers.
- [x] Schema drafted: `prisma/schema.prisma`.
- [x] Architecture recorded: `docs/ARCHITECTURE.md`.

## Phase 1: Project scaffold

Deliverables:
- `package.json` with pinned versions for Next 15.5.29, React 19, Prisma 6, Zod, Tailwind v4, Lucide, Argon2, Vitest, Playwright.
- `tsconfig.json` (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`).
- ESLint and Prettier configs.
- `.env.example` with every variable from the spec and the Nishchit variables.
- `src/lib/env` with Zod validation. The process fails fast in production if required values are missing or `ALLOW_LIVE_SMS` is set without a live key.
- Folder layout from `ARCHITECTURE.md` §5.

Verify: `npm install`, `npx tsc --noEmit`, `npm run lint`.

## Phase 2: Database and identity

Deliverables:
- Prisma schema applied as an initial migration: `npx prisma migrate dev --name init`.
- Prisma client singleton in `src/lib/db`.
- Password hashing (Argon2id), session creation and validation, CSRF, login throttling.
- Initial teacher bootstrap: runs at startup, checks for an existing account with `INITIAL_TEACHER_EMAIL`, creates it only if absent, hashes the password, never overwrites an existing account, never logs the password.
- Teacher invitation: 32-byte token, SHA-256 at rest, expiry, single-use acceptance.
- Login, logout, password reset, student activation.
- Authorization helpers in `src/lib/permissions`.

Acceptance:
- Bootstrap is idempotent. Running it twice creates one account and changes nothing on the second run.
- A password is never stored or logged in plain text.
- An expired, used or revoked invitation or activation token is rejected.
- Login locks after the configured number of failures.

Verify: `npx prisma validate`, `npx prisma migrate deploy` against a clean database, Vitest auth tests.

## Phase 3: Core domain (teacher side)

Deliverables, each as service functions with authorization and audit:
- Students: create (with guardian upsert by phone, and student activation SMS job), edit, archive, search, filter, paginate, duplicate detection on normalised phone and name.
- Batches: create, edit, archive, members add (existing student or new student in one transaction), remove (set `leftAt`), schedules.
- Attendance: fetch batch roster for a date, bulk mark, submit as one transaction, change log on edit, duplicate prevention through the unique key, absence notice job inserted in the same transaction.
- Exams: create for one or several batches, scheduling notice job, status transitions.
- Results: draft entry with validation (0 ≤ obtained ≤ total), publish as one transaction, revisions on edit, result notice jobs.
- Payments: monthly charge generation (idempotent per period), manual payment record, adjustment, outstanding balance by student, batch and month.

Acceptance:
- A teacher cannot read or change another teacher's students, batches, exams or payments. Tests cover each service with a second teacher's session.
- Attendance cannot create two rows for the same student, batch and date, including under concurrent submits.
- Publishing results is atomic. A failure leaves everything in draft.
- Balances are computed from the ledger. A test records a payment, an adjustment and a charge, then checks the derived balance.

Verify: integration tests against Postgres. Concurrency test with two parallel attendance submits.

## Phase 4: Nishchit integration

Deliverables:
- `lib/sms/nishchit.ts`: typed client for `POST /v1/messages`, `GET /v1/balance`, `POST /v1/pricing/preview`, `GET /v1/messages/{id}`. Timeout 15 seconds. Maps `error.code` to internal results. Never logs the bearer token or request bodies that contain tokens.
- `lib/sms/segmentation.ts`: client-side preview for the composer, aligned with `/v1/pricing/preview`. The server result is authoritative for billing.
- `lib/sms/validation.ts`: Bangladesh E.164 normalisation (`01XXXXXXXXX`, `8801XXXXXXXXX`, `+8801XXXXXXXXX`), rejecting any non-BD number before a send is queued.
- `lib/sms/service.ts`: queue a send (writes SmsMessage, SmsRecipient, NotificationJob in one transaction), process a send job, apply the result.
- Result mapping:
  - 201 → ACCEPTED, store `nishchitMessageId`, segments, credits.
  - Later `status: sent` → SENT.
  - Terminal `failed`, or `content_rejected`, or `invalid_recipient` → FAILED or SKIPPED with `lastErrorCode`.
  - `daily_quota_exceeded` → leave QUEUED with `runAfter` at the next Asia/Dhaka midnight.
  - `rate_limit_exceeded` → retry with `Retry-After`.
  - `gateway_unavailable` and timeouts → retry with backoff, up to `maxAttempts`, then FAILED.
  - `authentication_failed` → stop all sends, raise an operator alert.
- Balance cache: `SmsBalanceSnapshot`, refreshed on explicit request or after 15 minutes.
- Webhook receiver: verify `Nishchit-Signature` against the raw body and a 5-minute window, check idempotency on event id, apply status and delivery status. Respond 200 for unknown message ids and never 5xx for business reasons.
- `ALLOW_LIVE_SMS=false` in development: the client refuses live keys in non-production and sends only to test magic numbers.

Acceptance:
- Every test uses a mocked Nishchit client. No real SMS is sent by the test suite.
- Retries never create a second Nishchit message for the same recipient (same idempotency key).
- A message in SENT with `deliveryStatus UNKNOWN` is displayed as "Sent to network", never as failed or delivered.
- Webhook with a bad signature gets 400. A replayed event (same id) changes nothing.

Verify: Vitest with mocked HTTP, plus a manual run against `nk_test_` with magic numbers `+8801700000000` through `+8801700000004`, once the operator has a test key.

## Phase 5: Dashboards

Teacher: overview, students, batches, attendance, exams, results, payments, SMS and communication (composer with recipient selection, segment and credit estimate, confirmation, history), reports, teachers (invite, list, deactivate), settings (absence SMS toggle, SMS allowance).

Student (mobile-first): overview, attendance (by batch and month), exams (history and performance graph), payments (due, paid, history), profile (contact, password change).

Parent: child switcher, attendance, results and graph, upcoming exams, balance and payment history, announcements. Read-only.

Every page has loading, empty, error and success states. Empty states guide the next action and show no invented data.

Acceptance:
- Each role's navigation shows only its pages. The server rejects direct URLs for other roles.
- Student and parent screens are checked at 375px width.
- Analytics read from the database only.

Verify: Playwright E2E for login, student add, batch attendance, result publish, payment record, bulk SMS composer (SMS mocked).

## Phase 6: Testing and security review

- Unit tests: segmentation, phone normalisation, ledger math, permission guards, token hashing.
- Integration tests: every service with two teachers and a student and parent, checking cross-account access fails.
- Concurrency tests: attendance submit, payment record, job claim (two workers, one job).
- Failure tests: Nishchit timeout, 503, 429 daily, 402 insufficient credits, 422 content rejected.
- Security checks: IDOR across every route id parameter, CSRF on all mutations, rate limit on login, no secrets in responses or logs, `npm audit`.

Acceptance: all test suites pass. No known high-severity findings open.

## Phase 7: Deployment and documentation

Deliverables:
- `README.md`: install, development, environment setup, test commands.
- `docs/DEPLOYMENT.md`: production steps, `prisma migrate deploy`, first-run bootstrap, webhook registration, backups.
- `docs/NISHCHIT.md`: integration notes, error mapping, test magic numbers, trust tier and prefix requirements, the no-delivery-receipt model.
- `docs/BACKUP.md`: daily Postgres dumps with restore test, and retention for SMS bodies (Nishchit keeps them 12 months; Tutera-X keeps them only for support).
- Final command run log with results.

Final verification commands:

```bash
npm install
npx prisma generate
npx prisma validate
npx prisma migrate deploy
npx tsc --noEmit
npm run lint
npm run build
npm test
```

Each command is reported with its real result. A command that did not run is reported as not run.

## Open questions I will decide unless you object

1. Platform prefix `Tutera-X` for all messages (decided, see ARCHITECTURE N3).
2. Single platform Nishchit account with internal teacher allowances (decided, see ARCHITECTURE §3.1).
3. SMS bodies are English by default. Bangla is available but flagged as roughly three times the cost.
4. Teacher invitation emails are not sent. Invitations are delivered as a link the owner copies, because email delivery is out of scope and the spec only names SMS. Tell me if you want email.
5. Parent login uses phone number plus password, with the activation and reset flow over SMS. This matches the guardian phone identity in the spec.
