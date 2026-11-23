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
  const queued = counts.QUEUED ?? 0;
  const failed = counts.FAILED ?? 0;
  const statusMsg =
    balance.status === "not_configured"
      ? "The SMS provider is not configured on this server."
      : balance.status === "ok"
        ? null
        : balance.status === "auth_failed"
          ? "The SMS provider rejected the API key. Messages cannot be sent until an administrator fixes it."
          : "The SMS provider could not be reached. The last known balance is shown.";

  return (
    <>
      <PageHeader title="SMS and communication" description="Messages are sent to guardians and students. Each message shows its real status, and delivery is shown only when the network reports it." />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="col-span-2 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">SMS credits</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{balance.credits === null ? "—" : balance.credits.toLocaleString("en-US")}</p>
          <p className="mt-1 text-xs text-slate-500">
            {balance.asOf ? `Provider balance as of ${formatDateTime(balance.asOf)}` : "No balance fetched yet"}
            {balance.fetchedAt ? ` · checked ${formatDateTime(balance.fetchedAt)}` : ""}
          </p>
          {statusMsg ? <p className="mt-2 text-xs text-amber-800">{statusMsg}</p> : null}
          <form action={refreshBalanceAction} className="mt-3">
            <button className="btn btn-secondary btn-sm" type="submit" disabled={balance.status === "not_configured"}>Refresh balance</button>
          </form>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Your allowance</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{allowance ? allowance.remaining.toLocaleString("en-US") : 0}</p>
          <p className="mt-1 text-xs text-slate-500">{allowance ? `${allowance.allowance.toLocaleString("en-US")} granted · ${allowance.used.toLocaleString("en-US")} used · ${allowance.reserved.toLocaleString("en-US")} queued` : "No allowance set"}</p>
          {allowance && allowance.overdrawn > 0 ? <p className="mt-1 text-xs font-medium text-rose-700">Overdrawn by {allowance.overdrawn}. Sending is paused until the owner adds credits.</p> : null}
          {ledger.length > 0 ? (
            <details className="mt-2 text-xs text-slate-600">
              <summary className="cursor-pointer text-teal-700">Recent movements</summary>
              <ul className="mt-2 space-y-1">
                {ledger.map((e) => <li key={e.id}>{e.kind.toLowerCase()} {e.credits} · {e.createdAt.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" })}</li>)}
              </ul>
            </details>
          ) : null}
        </Card>
        <Stat label="Waiting to send" value={queued} hint="Queued or retrying" />
        <Stat label="Failed" value={failed} hint="Needs attention" />
        <Stat label="Sent to network" value={(counts.SENT ?? 0) + (counts.ACCEPTED ?? 0)} hint="Delivery is not reported on every route" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Send a message" className="lg:col-span-2" description="Use {name} for each student's name. Each recipient gets a personal copy with your name at the end.">
          {students.rows.length === 0 ? (
            <EmptyState title="No students to message" body="Add students first. Their guardians receive messages sent from here." />
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
                <span>I have checked the recipients and the message. It will be sent to each recipient's phone, and the cost is charged to the Tutera-X account.</span>
              </label>
              <div className="flex flex-wrap gap-2"><button className="btn btn-secondary" type="submit" formAction={checkSendCostAction} formNoValidate>Check cost</button><button className="btn btn-primary" type="submit">Send message</button></div>
            </form>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Absence notices" description="Sent to the guardian when a student is marked absent.">
            <form action={toggleAbsenceSmsAction} className="flex items-center justify-between gap-3">
              <input type="hidden" name="enabled" value={profile.absenceSmsEnabled ? "0" : "1"} />
              <span className="text-sm">{profile.absenceSmsEnabled ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>}</span>
              <button className="btn btn-secondary btn-sm" type="submit">Turn {profile.absenceSmsEnabled ? "off" : "on"}</button>
            </form>
          </Card>
          <Card title="Message history" description="Latest 40 recipients">
            {history.length === 0 ? (
              <p className="text-sm text-slate-600">Messages you send appear here with their status.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-slate-900">{h.student?.user.name ?? h.phoneE164}</span>
                      <Badge tone={STATUS_TONE[h.status] ?? "neutral"}>{h.status.toLowerCase()}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {h.smsMessage.purpose.replace(/_/g, " ").toLowerCase()} · {formatDateTime(h.createdAt)}
                      {h.deliveryStatus === "DELIVERED" ? " · delivered" : h.deliveryStatus === "UNDELIVERED" ? " · not delivered" : ""}
                      {h.skipReason ? ` · ${h.skipReason.replace(/_/g, " ")}` : ""}
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
