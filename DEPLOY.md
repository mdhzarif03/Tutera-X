# Deploying Tutera-X

Work through these in order. Each step says what it checks.

## 0. Before anything else: change the passwords
- The owner password is weak (`123456789`). Change it on the Settings page.
- An owner password was typed into a chat earlier. Treat it as exposed and do not reuse it.

## 1. Check nothing secret will be pushed
```powershell
git check-ignore .env        # must print ".env"
```

## 2. Push to GitHub
```powershell
git init
git add .
git commit -m "Tutera-X: production release"
git branch -M main
git remote add origin https://github.com/<your-user>/tutera-x.git
git push -u origin main
```
Or, with the GitHub CLI: `gh repo create tutera-x --private --source=. --push`

## 3. Migrate the production database (Neon)
Take a snapshot first in the Neon console. Then, with the production URL:
```powershell
$env:DIRECT_URL = "<production direct URL from Neon, pooling off>"
npx prisma migrate deploy
Remove-Item Env:DIRECT_URL
```
This applies only migrations that are not yet on production. Confirm the output lists them.

## 4. Create the Vercel project
```powershell
npm i -g vercel
vercel login
vercel link                  # choose "Import Git repository" or link this folder
```

## 5. Set environment variables (Production)
Set these in Vercel: Project → Settings → Environment Variables, or with `vercel env add <NAME> production`.

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon pooled URL (the app uses this) |
| `DIRECT_URL` | Neon direct URL, pooling off (migrations use this) |
| `APP_URL` | `https://<your-domain>` (must be https) |
| `INITIAL_TEACHER_EMAIL` | owner email (only needed the first time) |
| `INITIAL_TEACHER_PASSWORD` | owner password (remove after first sign-in) |
| `NISHCHIT_API_BASE_URL` | `https://api.nishchit.tech` |
| `NISHCHIT_API_KEY` | `nk_test_...` first; switch to `nk_live_...` later |
| `NISHCHIT_WEBHOOK_SECRET` | from the Nishchit dashboard |
| `ALLOW_LIVE_SMS` | `false` until you are ready to send real texts |
| `JOB_RUNNER` | `off` (Vercel functions do not stay alive; Vercel Cron runs the queue) |
| `CRON_SECRET` | a random secret, see below |

Generate `CRON_SECRET`:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 6. Deploy
```powershell
vercel --prod
```
Vercel runs `prisma generate` and `next build` (the `build` script does both).

## 7. Connect Nishchit
Register the webhook at `https://<your-domain>/api/webhooks/nishchit` with the same secret as `NISHCHIT_WEBHOOK_SECRET`.

## 8. Confirm it works
- Sign in as the owner. Remove `INITIAL_TEACHER_PASSWORD` from Vercel afterwards.
- Add a test student with a test phone number. Check the welcome text arrives (test key only).
- Send one test message with **See the cost** and then **Send message**.
- Check Vercel Cron is running: Project → Settings → Cron Jobs.

## Important notes
- **Cron schedule:** a every-minute schedule needs the Vercel Pro plan. On the free plan, Vercel Cron runs at most once a day, which would delay texts by up to a day. In that case, use an external scheduler (for example cron-job.org) to call `https://<your-domain>/api/jobs/run` every minute with header `Authorization: Bearer <CRON_SECRET>`.
- **Live texts:** keep `ALLOW_LIVE_SMS=false` and `NISHCHIT_API_KEY=nk_test_...` until every check in step 8 passes. Then switch both.
- **Backups:** Neon keeps point-in-time history on paid plans. Confirm yours does before going live.

## Not yet verified
- The build, migrations and integration tests have not been run against a real database in this environment. Run them against a staging database before step 3.
