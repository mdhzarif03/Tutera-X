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
npm run dev                   # http://localhost:3000
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

`npm run build` only generates Prisma Client and builds Next.js; it does not apply migrations. For a production release that needs schema changes, review the additive migration and run `npm run db:deploy` against the intended database before switching application code. Do not put production migration execution into the build step.

Migrations in order:

- `20261122180000_init`: the initial schema. Applied or not, it must not be edited, because Prisma checksums applied migrations. `scripts/generate-initial-migration.py` refuses to overwrite it.
- `20261123090000_sms_recipient_student_fk`: adds the foreign key from `SmsRecipient.studentId` to `StudentProfile.userId`, which the `SmsRecipient.student` relation needs. It changes no data. Before adding the constraint it checks for recipients that point at missing students and stops with a clear error if it finds any. Running `npx prisma migrate deploy` against an existing database applies only this new migration.
- `20261124090000_student_group`: adds the student group (Science, Commerce, Humanities) for Class 9 to 12. It only adds a column, so existing data is unchanged.
- `20261124100000_teacher_phone_invites`: adds phone-based teacher invitations and optional subject details. Existing email invitations remain usable.
- `20261124110000_password_reset_otp_cooldowns`: adds SMS reset-code cooldown and password-change timestamps, plus failed-code attempt tracking. It adds nullable columns and a counter default; existing accounts and reset rows remain intact.
- `20261124120000_batch_whatsapp_link`: adds an optional `whatsappLink` column to `Batch` (teacher-set WhatsApp group invite, shown to students in the batch). Nullable and additive; existing batches are unchanged.

## SMS pricing

Before a bulk send or an exam announcement, the app asks Nishchit for a price with `POST /v1/pricing/preview` (`{ body, recipients }`). The body is priced with the `[Tutera-X]` prefix included, which is conservative: if Nishchit adds the prefix itself, the prefix is counted twice and the quote is only ever too high.

If the provider is not configured, unreachable, or returns something that fails validation, the app uses its local segment rules instead. The quote records its `source` (`provider` or `local`) and the reason for any fallback. Quotes are fetched before the database transaction opens, so no network call runs while rows are locked. The **Check cost** button on the SMS page shows the estimate without sending.

## Message balance

- Messages are paid for from **one shared balance at Nishchit** (nishchit.tech). Every teacher uses the same balance. There are no per-teacher limits.
- The Messages page shows the balance in credits, and how many short English messages it covers. One short English message uses one credit. Bangla and longer messages use more, and the composer shows the count before sending.
- When the balance is known to be empty, sending is stopped with a clear message before anything is queued. Automatic texts (absences, exams, results) are still queued and sent once the balance is topped up.
- The provider charges each accepted message and refunds failed ones, so the app keeps no separate money records.
- Credits are topped up at nishchit.tech. The balance page's **Check now** button reads the latest figure.
- Old quota columns and the allowance ledger remain in the database but are no longer used. A future migration can remove them once you are sure no one needs the history.


## Activation and invitation links; password reset codes

Activation and invitation use single-use links whose token is carried in the URL **fragment** (`/activate#<token>`, `/accept-invite#<token>`). Browsers do not send the fragment to the server, so the token does not reach request logs or Referer headers. On load, the page reads the fragment, removes it from the address bar, and exchanges it with a POST for a short-lived httpOnly, same-site cookie scoped to that page.

Forgot-password sends a 6-digit code by SMS. The code expires after 10 minutes and is invalidated after five incorrect attempts. A user can request a reset code once every three days, measured from the request; successful use revokes all active sessions. A password changed while signed in does not require the old password and can be done once every seven days. That seven-day limit applies to signed-in changes; a password reset uses the separate three-day request limit. Other sessions are revoked after a signed-in password change, while the current session stays active.

Invitations expire after 72 hours and activation links expire after 72 hours. Both are single-use.

The activation and invitation exchanges require JavaScript. Without it, the page cannot read the link fragment.

## Background jobs and multiple instances

- Startup work (creating the owner account from `.env` if missing, and starting the SMS runner) runs on the first request to each server process. It is logged, for example `[bootstrap] created: ...`, and retried on later requests if it fails. A server with no traffic does not start its runner until something requests a page, so a production deployment should receive one request after each start, or use the cron route below.
- SMS jobs live in PostgreSQL. With `JOB_RUNNER=on` (the default) each instance polls for due jobs every five seconds.
- **Safe with several instances.** A conditional UPDATE atomically claims each job and increments its attempt number. Result writes are fenced by that number, so an expired worker cannot overwrite a newer worker's state. A claim carries a lock (two minutes); a crashed worker's job becomes claimable when the lock expires.
- **Delivery is at-least-once.** A reclaimed send reuses the recipient's idempotency key, so Nishchit returns the original message instead of sending another. Settlement is idempotent, so a repeated pass cannot double-charge the allowance.
- **Retries are bounded.** Unexpected processing errors use capped exponential backoff and eventually become `FAILED_PERMANENT`; invalid job payloads and missing recipients are recorded as permanent failures.
- **Shutdown.** On SIGTERM or SIGINT the runner stops polling and waits for the current pass to finish before the process exits.
- Alternative: set `JOB_RUNNER=off` and call `POST /api/jobs/run` every minute with `Authorization: Bearer $CRON_SECRET`.
- The checked-in Vercel schedule runs once daily at 03:00 UTC. On a plan that limits cron frequency, `JOB_RUNNER=off` therefore delays queued messages until that run; use a higher-frequency Vercel cron plan or an external scheduler for near-real-time delivery.
- Webhook: register `https://<domain>/api/webhooks/nishchit` with `NISHCHIT_WEBHOOK_SECRET`. Signatures are checked with a five-minute window.

## Design system

The interface uses one design system. Its tokens and motion live in `src/app/globals.css`, and its components in `src/components/`.

- **Brand:** an indigo-to-violet gradient with an amber accent. The logo (`src/components/logo.tsx`) is an open book whose fold forms a T, with an amber spark. The browser icon is `public/favicon.svg`.
- **Type:** Plus Jakarta Sans, loaded by `next/font/google` at build time. The build needs internet access the first time it runs.
- **Icons:** `lucide-react`, chosen by destination in `nav-links.tsx`. Emoji are deliberately not used as icons, because they render differently on each operating system.
- **Motion:** staggered entrances, rising chart bars, and a floating empty-state mark. Everything is disabled automatically for users who set "reduce motion" in their operating system.
- **Contrast:** text and interface colours are chosen to meet WCAG AA (4.5:1 for body text).

The redesign changed appearance only. Services, actions, API routes, database code and form field names are unchanged.

## Environment

See `.env.example`. Required: `DATABASE_URL`. Required in production: an `https` `APP_URL`. To send SMS: `NISHCHIT_API_KEY`. Use `nk_test_` keys for development. A live `nk_live_` key only sends if `ALLOW_LIVE_SMS=true`.

## Tests

```bash
npm test                  # unit tests, run with node:test through tsx
npm run test:integration  # PostgreSQL integration tests; needs TEST_DATABASE_URL
npm run typecheck
```

`npm test` covers phone rules, SMS segmentation, Dhaka time, webhook signatures, templates, validation, environment parsing, pricing (including fallback when the provider is unreachable), the message balance, and invitation token format.

`npm run test:integration` covers student creation and PostgreSQL queue/job behavior. It only connects when `TEST_DATABASE_URL` points to a loopback database whose name contains `test` and differs from `DATABASE_URL`; otherwise it reports skipped tests, not passes.

## Delivery and cost notes

- The primary Bangladesh route reports no delivery receipts. Messages show as "sent to network" unless Nishchit reports more.
- Bangla or other non-GSM characters cost roughly three times as much. The composer shows the encoding and segment count.
- A new Nishchit account can send 50 messages a day to 20 numbers until its trust tier rises. Larger batches queue and continue the next day.

## Verification status

**Run in this environment (real execution):**

- Unit suite: 64 of 64 tests pass (`npm test`).
- TypeScript check: `npm run typecheck` passes.
- Prisma schema validation: `npm run db:validate` passes.
- Production build: `npm run build` succeeds with a non-routable loopback database URL and `JOB_RUNNER=off`. Static generation logs that bootstrap cannot reach the dummy database; no production database was contacted.
- PostgreSQL integration suite: three suites are explicitly skipped because `TEST_DATABASE_URL` is not set. **No integration tests ran.**

Not run: `npm run db:verify` with a shadow database, migration deployment, PostgreSQL integration tests, browser testing, or end-to-end testing against Nishchit. The password-recovery migration has not been applied.

## Behaviour notes for owners and teachers

- **Deleting a student** removes them and their SMS notice history only when nothing else is recorded for them (no attendance, fees, results, payments or parent login). Otherwise they are archived. Removing notice history is intentional: it applies only to students with no other records.
- **Removing an absence mark** sends the parent a short correction text if they were told about the absence. Nothing is sent otherwise.
- **Changing marks after results are shared** sends each affected parent a correction text. Shared results cannot be taken back.
- **Teacher password recovery:** the owner can send a reset code by SMS to an active teacher with a phone number on file. The teacher enters their login identifier and code on the Forgot password page.
- **Password changes:** forgotten-password recovery uses a one-time SMS code, with one request allowed every three days starting at the request time. A signed-in user can change their password without the old password; they must wait seven days between changes. Other sessions are signed out, while the current session stays active.
- **Teacher onboarding:** new invitations are sent by SMS to the supplied phone number. Invitees set their name, optional subjects and institution, and password before joining. Phone-based teacher accounts sign in with that phone number. Previously sent email invitations remain valid.
- **Balance check:** pages never wait for the messaging provider. The last known balance is shown and refreshed in the background. An explicit refresh still waits for the result.
- **JavaScript:** invitation and welcome links read their secret in the browser, so JavaScript must be on. Pages show a note if it is off.

## Students, parents and messages

- **One profile per student.** A student record holds the student's name, class, medium, group (Class 9 to 12 only), school, monthly fee, and the parent or guardian's phone. A login ID uses the first letter of each name word plus a globally unique random number; students and parents use the same login.
- **Messages go to the parent or guardian's phone.** Welcome links, absence texts, exam notices and results all go there. Students have no phone number of their own in Tutera-X.
- **Choices are fixed:** Class 6 to Class 12; medium is English Version, English Medium or Bangla Version; group is Science, Commerce or Humanities. The lists live in `src/lib/student-options.ts`.
- **Existing data:** a student's old phone number is kept in the database but is no longer shown or used. Students whose medium was typed in before may need it picked again the next time their profile is saved.
- **Parent accounts:** the separate parent sign-in is no longer created. A parent signs in with the student's login ID, the same as the student. Existing parent accounts still work.

