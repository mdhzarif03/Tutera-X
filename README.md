# Tutera-X

Tutor and school operations for teachers, students and parents. Next.js 15, React 19, TypeScript, Prisma 6, PostgreSQL, Tailwind CSS v4, and the Nishchit SMS API.

**Status: not yet production-ready.** The code is written and the parts that can run without a database or network have been run. Dependency installation, Prisma validation, migration execution against PostgreSQL, the production build, and browser testing have not been run. See "Verification status" below before deploying.

## Contents

- `src/app`: pages and API routes. `src/components`: UI. `src/services`: business logic. `src/actions`: form mutations. `src/lib`: auth, SMS, pricing, allowances, jobs, env, dates, money.
- `prisma/schema.prisma`: the schema. `prisma/migrations/20261122180000_init/migration.sql`: the initial migration.
- `scripts/generate-initial-migration.py`: produced the initial migration from the schema as a bootstrap. Prisma's own diff (below) is the authority.
- `scripts/verify-migration.sh`: checks the migrations against the schema with `prisma migrate diff`.
- `tests/`: unit tests. `tests/integration/`: PostgreSQL integration tests.
- `docs/ARCHITECTURE.md`: design notes and Nishchit API findings.

## Setup

Requirements: Node.js 20.9 or later, PostgreSQL 14 or later.

```bash
cp .env.example .env          # set DATABASE_URL, APP_URL, the initial owner, and Nishchit values
npm install
npx prisma generate
npx prisma migrate deploy     # applies prisma/migrations (use "migrate dev" while developing)
npm run dev                   # http://tuterax.vercel.app
```

On first start the owner account is created from `INITIAL_TEACHER_EMAIL` and `INITIAL_TEACHER_PASSWORD`. An existing account is never overwritten. Remove the password from `.env` after first sign-in.

### Fresh database

1. Create an empty database and set `DATABASE_URL`.
2. `npx prisma migrate deploy` applies the initial migration.
3. Start the app. The owner account is created.
4. Sign in as the owner, open **Teachers**, and grant yourself an SMS allowance. Until an allowance is granted, manual sends are refused and automatic notices are skipped. This is deliberate: nothing is charged to an account that was never funded.

## Migrations and drift checking

The source of truth is `prisma/schema.prisma`. Migrations live in `prisma/migrations`. To check they agree, on a machine with Prisma and an empty disposable database:

```bash
SHADOW_DATABASE_URL=postgresql://... npm run db:verify
```

This runs `prisma validate`, then `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma`, and exits non-zero if the schema has changes no migration contains. If Prisma's diff disagrees with `scripts/generate-initial-migration.py`, Prisma wins; regenerate or correct the migration.

After any schema change, add a migration with `npx prisma migrate dev --name <change>`. Never edit a migration that has been applied.

Migrations in order:

- `20261122180000_init`: the initial schema. Applied or not, it must not be edited, because Prisma checksums applied migrations. `scripts/generate-initial-migration.py` refuses to overwrite it.
- `20261123090000_sms_recipient_student_fk`: adds the foreign key from `SmsRecipient.studentId` to `StudentProfile.userId`, which the `SmsRecipient.student` relation needs. It changes no data. Before adding the constraint it checks for recipients that point at missing students and stops with a clear error if it finds any. Running `npx prisma migrate deploy` against an existing database applies only this new migration.

## SMS pricing

Before a bulk send or an exam announcement, the app asks Nishchit for a price with `POST /v1/pricing/preview` (`{ body, recipients }`). The body is priced with the `[Tutera-X]` prefix included, which is conservative: if Nishchit adds the prefix itself, the prefix is counted twice and the quote is only ever too high.

If the provider is not configured, unreachable, or returns something that fails validation, the app uses its local segment rules instead. The quote records its `source` (`provider` or `local`) and the reason for any fallback. Quotes are fetched before the database transaction opens, so no network call runs while rows are locked. The **Check cost** button on the SMS page shows the estimate without sending.

## SMS allowances and the shared balance

- The **shared Nishchit balance** is the platform's money, read from `GET /v1/balance` and cached for 15 minutes.
- Each teacher has a **per-teacher allowance** in credits (one credit is one segment). The owner grants and reduces it on the Teachers page. Every change is recorded in the allowance ledger.
- **Reservation.** Before a message is queued, its credits are reserved against the teacher's allowance in one conditional SQL update. Each recipient reserves the larger of its local estimate and the provider's quote, so an underestimate can't quietly under-reserve.
- **Settlement.** When Nishchit accepts a message, the reservation is settled against the credits actually billed. The unused part is released.
- **Discrepancy policy.** If Nishchit bills more than was reserved, the provider has already charged that amount, so the app records all of it as used, records the excess as an `OVERAGE` ledger entry, and marks the teacher **overdrawn**. An overdrawn allowance accepts no new reservations, so sends are refused until the owner adds credits. The overdrawn amount is shown on the overview and SMS pages. The app never refuses to record a charge the provider has already made, and it never hides one.
- **Refund.** A message that fails after acceptance is refunded by Nishchit, and the app returns the consumed credits.
- **Strict vs skip.** Manual sends and account activations are strict: they are refused with a clear message when the allowance is short. Automatic notices (absences, exam announcements, results) are skip-mode: attendance, exams and results always save, and notices beyond the allowance are recorded as skipped.

## Activation, password reset and invitation links

All three use the same pattern. The link carries its token in the URL **fragment** (`/activate#<token>`, `/reset#<token>`, `/accept-invite#<token>`). Browsers do not send the fragment to the server, so the token does not reach request logs or Referer headers. On load, the page reads the fragment, removes it from the address bar, and exchanges it with a POST for a short-lived httpOnly, same-site cookie scoped to that page. The form reads the cookie, not the URL.

Tokens are single-use and expire: invitations after 72 hours, activation after 72 hours, password reset after one hour. The exchange checks the token against the database first.

**Upgrade note.** Activation and reset links sent before this version used a path token (`/activate/<token>`, `/reset/<token>`). Those URLs no longer exist. Ask the teacher to **send a new activation link**, or request a new password reset.

The exchange requires JavaScript. Without it, the page cannot read the fragment.

## Background jobs and multiple instances

- Startup work (creating the owner account from `.env` if missing, and starting the SMS runner) runs on the first request to each server process. It is logged, for example `[bootstrap] created: ...`, and retried on later requests if it fails. A server with no traffic does not start its runner until something requests a page, so a production deployment should receive one request after each start, or use the cron route below.
- SMS jobs live in PostgreSQL. With `JOB_RUNNER=on` (the default) each instance polls for due jobs every five seconds.
- **Safe with several instances.** Each job is claimed by one conditional UPDATE, so exactly one worker in one instance runs it. A claim carries a lock (two minutes). If a worker crashes, its job, including one still marked `RUNNING`, becomes claimable when the lock expires.
- **Delivery is at-least-once.** A reclaimed send reuses the recipient's idempotency key, so Nishchit returns the original message instead of sending another. Settlement is idempotent, so a repeated pass cannot double-charge the allowance.
- **Shutdown.** On SIGTERM or SIGINT the runner stops polling and waits for the current pass to finish before the process exits.
- Alternative: set `JOB_RUNNER=off` and call `POST /api/jobs/run` every minute with `Authorization: Bearer $CRON_SECRET`.
- Webhook: register `https://<domain>/api/webhooks/nishchit` with `NISHCHIT_WEBHOOK_SECRET`. Signatures are checked with a five-minute window.

## Environment

See `.env.example`. Required: `DATABASE_URL`. Required in production: an `https` `APP_URL`. To send SMS: `NISHCHIT_API_KEY`. Use `nk_test_` keys for development. A live `nk_live_` key only sends if `ALLOW_LIVE_SMS=true`.

## Tests

```bash
npm test                  # unit tests, run with node:test through tsx
npm run test:integration  # PostgreSQL integration tests; needs TEST_DATABASE_URL
npm run typecheck
```

`npm test` covers phone rules, SMS segmentation, Dhaka time, webhook signatures, templates, validation, environment parsing, pricing (including fallback when the provider is unreachable), allowance arithmetic and the settlement policy, and invitation token format.

`npm run test:integration` covers, against real PostgreSQL: 100 concurrent reservations against a 10-credit allowance, strict refusal with no leftover rows after a rolled-back transaction, skip-mode behaviour, idempotent settlement, overage recording and the resulting block, refunds after acceptance, owner-only allowance changes with the floor enforced, and exclusive job claims with stale-lock reclaim. Without `TEST_DATABASE_URL` it reports one skipped entry, not a pass.

## Delivery and cost notes

- The primary Bangladesh route reports no delivery receipts. Messages show as "sent to network" unless Nishchit reports more.
- Bangla or other non-GSM characters cost roughly three times as much. The composer shows the encoding and segment count.
- A new Nishchit account can send 50 messages a day to 20 numbers until its trust tier rises. Larger batches queue and continue the next day.

## Verification status

**Run in this environment (real execution):**

- Unit suite: 50 of 50 tests pass (`node:test` with `tsx`). This includes a configured-but-unreachable provider, which made a real failed network call and fell back to the local estimate.
- Integration suite: discovered and reports one explicit skip, because no PostgreSQL database was available. **Its tests have not run.**
- TypeScript parser: zero syntax errors across all source files.
- Import resolution: every internal import resolves to a file.
- The initial migration was regenerated from the final schema, with 29 tables, 11 enums and 33 foreign keys. The generator's own consistency checks passed.

**Not run, because this environment has no package registry access and no PostgreSQL:**

- `npm install`; `prisma generate`; `prisma validate`; `prisma migrate diff` (`npm run db:verify`); `prisma migrate deploy` against a real database.
- `npm run typecheck` with the real dependencies. The remaining type errors come from missing Prisma, Node and Next type packages, not from application logic, but this must be confirmed.
- `npm run build`.
- `npm run test:integration` against PostgreSQL. The concurrency and settlement guarantees described above are designed to hold through conditional SQL updates, but they are not yet demonstrated on a database.
- Running the app in a browser, including the fragment-token exchange pages and the job runner under real load.
- End-to-end behaviour against the live Nishchit API. The pricing preview response is validated defensively, but its live shape is confirmed only from Nishchit's published documentation.

Before deploying, run: `npm install`, `npx prisma generate`, `npx prisma validate`, `npm run db:verify` with a shadow database, `npx prisma migrate deploy`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:integration` with `TEST_DATABASE_URL`, and a manual browser pass through sign-in, activation, a send with **Check cost**, an attendance save with an absence notice, and a result publish.
