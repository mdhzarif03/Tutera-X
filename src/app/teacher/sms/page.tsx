import { requireRole } from "@/lib/auth/guards";
import { checkSendCostAction, refreshBalanceAction, sendMessageAction, toggleAbsenceSmsAction } from "@/actions/teacher";
import { listBatches } from "@/services/batches";
import { listStudents } from "@/services/students";
import { getSmsBalance, listSmsHistory, smsStatusCounts } from "@/services/comms";
import { allowanceSummary, allowanceLedger } from "@/lib/sms/allowance";
import { Badge, Card, EmptyState, Field, Flash, PageHeader, Stat } from "@/components/ui";
import { SmsComposer } from "@/components/sms-counter";
import { formatDateTime } from "@/lib/dates";
import { pick } from "@/lib/params";
import { db } from "@/lib/db";

export const metadata = { title: "SMS" };

const STATUS_TONE: Record<string, "good" | "bad" | "warn" | "neutral" | "info"> = {
  QUEUED: "warn",
  SUBMITTING: "info",
  ACCEPTED: "good",
  SENT: "good",
  FAILED: "bad",
  SKIPPED: "neutral",
  CANCELLED: "neutral",
};

const STATUS_WORDS: Record<string, string> = {
  QUEUED: "waiting",
  SUBMITTING: "sending",
  ACCEPTED: "sent",
  SENT: "sent",
  FAILED: "not sent",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
};

const SKIP_WORDS: Record<string, string> = {
  allowance_exhausted: "no credits left",
  live_sms_disabled: "test mode",
  content_rejected: "message not allowed",
};

export default async function SmsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const [balance, batches, students, history, counts, profile, allowance, ledger] = await Promise.all([
    getSmsBalance(),
    listBatches(t.id, false),
    listStudents(t.id, { q: "", page: 1, archived: false }),
    listSmsHistory(t.id, 40),
    smsStatusCounts(t.id),
    db.teacherProfile.findUniqueOrThrow({ where: { userId: t.id }, select: { absenceSmsEnabled: true } }),
    allowanceSummary(t.id),
    allowanceLedger(t.id, 8),
  ]);
  const waiting = counts.QUEUED ?? 0;
  const failed = counts.FAILED ?? 0;
  const statusMsg =
    balance.status === "not_configured"
      ? "Messages aren't set up on this server yet. Ask your administrator."
      : balance.status === "ok"
        ? null
        : balance.status === "auth_failed"
          ? "Messages are paused. Ask your administrator to check the setup."
          : "We couldn't reach the messaging service. The last known balance is shown.";

  return (
    <>
      <PageHeader title="Messages" description="Send a message to students or parents. You'll see the cost before you send." />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="col-span-2 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">SMS credits</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{balance.credits === null ? "—" : balance.credits.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-slate-500">
            {balance.asOf ? `Balance as of ${formatDateTime(balance.asOf)}` : "Not checked yet"}
            {balance.fetchedAt ? ` · checked ${formatDateTime(balance.fetchedAt)}` : ""}
          </p>
          {statusMsg ? <p className="mt-2 text-xs text-amber-800">{statusMsg}</p> : null}
          <form action={refreshBalanceAction} className="mt-3">
            <button className="btn btn-secondary btn-sm" type="submit" disabled={balance.status === "not_configured"}>Refresh balance</button>
          </form>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Your credits</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{allowance ? allowance.remaining.toLocaleString("en-US") : 0}</p>
          <p className="mt-1 text-xs text-slate-500">{allowance ? `${allowance.allowance.toLocaleString("en-US")} total · ${allowance.used.toLocaleString("en-US")} used · ${allowance.reserved.toLocaleString("en-US")} waiting` : "Not set up yet"}</p>
          {allowance && allowance.overdrawn > 0 ? <p className="mt-1 text-xs font-medium text-rose-700">You're over your limit. Messages are on hold until the owner adds credits.</p> : null}
          {ledger.length > 0 ? (
            <details className="mt-2 text-xs text-slate-600">
              <summary className="cursor-pointer text-teal-700">Recent activity</summary>
              <ul className="mt-2 space-y-1">
                {ledger.map((e) => <li key={e.id}>{e.kind.toLowerCase()} {e.credits} · {e.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}</li>)}
              </ul>
            </details>
          ) : null}
        </Card>
        <Stat label="Waiting to send" value={waiting} hint="Waiting or retrying" />
        <Stat label="Failed" value={failed} hint="Needs attention" />
        <Stat label="Sent" value={(counts.SENT ?? 0) + (counts.ACCEPTED ?? 0)} hint="Sent successfully" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Send a message" className="lg:col-span-2" description="Use {name} to add each student's name. Each parent gets a personal copy.">
          {students.rows.length === 0 ? (
            <EmptyState title="No students to message" body="Add students first. Their parents receive messages sent from here." />
          ) : (
            <form action={sendMessageAction} className="grid gap-5">
              <fieldset className="grid gap-3">
                <legend className="label">Send to</legend>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="target" value="batches" defaultChecked className="accent-teal-700" /> Selected batches</label>
                <div className="ml-6 grid gap-2 sm:grid-cols-2">
                  {batches.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="batchIds" value={b.id} className="size-4 accent-teal-700" /> {b.name} <span className="text-xs text-slate-500">({b._count.members})</span></label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="target" value="all" className="accent-teal-700" /> Every active student</label>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="target" value="student" className="accent-teal-700" /> One student</label>
                <div className="ml-6">
                  <label htmlFor="studentId" className="sr-only">Student</label>
                  <select id="studentId" name="studentId" className="select max-w-sm" defaultValue="">
                    <option value="">Choose a student</option>
                    {students.rows.map((r) => <option key={r.student.userId} value={r.student.userId}>{r.student.user.name}</option>)}
                  </select>
                </div>
              </fieldset>

              <div>
                <label htmlFor="body" className="label">Message</label>
                <SmsComposer />
              </div>

              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 size-4 accent-teal-700" />
                <span>I've checked the message and who will receive it.</span>
              </label>
              <div className="flex flex-wrap gap-2"><button className="btn btn-secondary" type="submit" formAction={checkSendCostAction} formNoValidate>See the cost</button><button className="btn btn-primary" type="submit">Send message</button></div>
            </form>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Absence notices" description="Parents get a text when their child is marked absent.">
            <form action={toggleAbsenceSmsAction} className="flex items-center justify-between gap-3">
              <input type="hidden" name="enabled" value={profile.absenceSmsEnabled ? "0" : "1"} />
              <span className="text-sm">{profile.absenceSmsEnabled ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>}</span>
              <button className="btn btn-secondary btn-sm" type="submit">Turn {profile.absenceSmsEnabled ? "off" : "on"}</button>
            </form>
          </Card>
          <Card title="Sent messages" description="Latest 40">
            {history.length === 0 ? (
              <p className="text-sm text-slate-600">Messages you send will appear here.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-slate-900">{h.student?.user.name ?? h.phoneE164}</span>
                      <Badge tone={STATUS_TONE[h.status] ?? "neutral"}>{STATUS_WORDS[h.status] ?? h.status.toLowerCase()}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {h.smsMessage.purpose.replace(/_/g, " ").toLowerCase()} · {formatDateTime(h.createdAt)}
                      {h.deliveryStatus === "DELIVERED" ? " · delivered" : h.deliveryStatus === "UNDELIVERED" ? " · not delivered" : ""}
                      {h.skipReason ? ` · ${SKIP_WORDS[h.skipReason] ?? "not sent"}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
