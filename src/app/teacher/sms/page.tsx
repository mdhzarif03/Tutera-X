import { MessageSquare, RefreshCw, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { checkSendCostAction, refreshBalanceAction, sendMessageAction, toggleAbsenceSmsAction } from "@/actions/teacher";
import { listBatches } from "@/services/batches";
import { listStudents } from "@/services/students";
import { getSmsBalance, listSmsHistory, smsStatusCounts } from "@/services/comms";
import { Badge, Card, EmptyState, Flash, PageHeader, Stat } from "@/components/ui";
import { SmsComposer } from "@/components/sms-counter";
import { formatDateTime } from "@/lib/dates";
import { pick } from "@/lib/params";
import { shortMessagesLeft } from "@/lib/sms/balance";
import { db } from "@/lib/db";

export const metadata = { title: "Messages" };

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
  live_sms_disabled: "test mode",
  content_rejected: "message not allowed",
};

function balanceNote(status: string): string | null {
  switch (status) {
    case "not_configured":
      return "Messages aren't set up on this server yet. Ask your administrator.";
    case "auth_failed":
      return "Messages are paused. Ask your administrator to check the setup.";
    case "unreachable":
      return "We couldn't reach the messaging service. The last known balance is shown.";
    case "unchecked":
      return "Checking the balance now. Refresh this page in a moment.";
    default:
      return null;
  }
}

export default async function SmsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const [balance, batches, students, history, counts, profile] = await Promise.all([
    getSmsBalance(),
    listBatches(t.id, false),
    listStudents(t.id, { q: "", page: 1, archived: false }),
    listSmsHistory(t.id, 40),
    smsStatusCounts(t.id),
    db.teacherProfile.findUniqueOrThrow({ where: { userId: t.id }, select: { absenceSmsEnabled: true } }),
  ]);
  const left = shortMessagesLeft(balance.credits);
  const note = balanceNote(balance.status);

  return (
    <>
      <PageHeader
        title="Messages"
        description="Send a message to students or parents. The balance is shared by all teachers, and you see the cost before you send."
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-2" icon={<Wallet className="h-4 w-4" aria-hidden="true" />} title="Message balance" description="Paid to Nishchit. Shared by every teacher.">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-bold tabular-nums tracking-tight text-slate-900">
                {balance.credits === null ? "—" : balance.credits.toLocaleString("en-US")}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {left === null ? "Credits not checked yet" : <>About <strong className="text-slate-900">{left.toLocaleString("en-US")}</strong> short messages can still be sent</>}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                One short English message uses one credit. Bangla and longer messages use more.
                {balance.fetchedAt ? ` Last checked ${formatDateTime(balance.fetchedAt)}.` : ""}
              </p>
            </div>
            <form action={refreshBalanceAction}>
              <button className="btn btn-secondary btn-sm" type="submit" disabled={balance.status === "not_configured"}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Check now
              </button>
            </form>
          </div>
          {note ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">{note}</p> : null}
        </Card>
        <Stat label="Waiting to send" value={counts.QUEUED ?? 0} hint="Waiting or retrying" tone="info" icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />} />
        <Stat label="Not sent" value={counts.FAILED ?? 0} hint="Needs a look" tone="bad" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Send a message" className="lg:col-span-2" description="Use {name} to add each student's name. Each parent gets a personal copy.">
          {students.rows.length === 0 ? (
            <EmptyState title="No students to message yet" body="Add students first. Their parents receive messages sent from here." />
          ) : (
            <form action={sendMessageAction} className="grid gap-5">
              <fieldset className="grid gap-3">
                <legend className="label">Send to</legend>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="target" value="batches" defaultChecked className="accent-indigo-600" /> Selected batches</label>
                <div className="ml-6 grid gap-2 sm:grid-cols-2">
                  {batches.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="batchIds" value={b.id} className="size-4 accent-indigo-600" /> {b.name}{" "}
                      <span className="text-xs text-slate-500">({b._count.members})</span>
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="target" value="all" className="accent-indigo-600" /> Every active student</label>
                <label className="flex items-center gap-2 text-sm"><input type="radio" name="target" value="student" className="accent-indigo-600" /> One student</label>
                <div className="ml-6">
                  <label htmlFor="studentId" className="sr-only">Student</label>
                  <select id="studentId" name="studentId" className="select max-w-sm" defaultValue="">
                    <option value="">Choose a student</option>
                    {students.rows.map((r) => (
                      <option key={r.student.userId} value={r.student.userId}>{r.student.user.name}</option>
                    ))}
                  </select>
                </div>
              </fieldset>

              <div>
                <label htmlFor="body" className="label">Message</label>
                <SmsComposer />
              </div>

              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" name="confirm" value="yes" required className="mt-0.5 size-4 accent-indigo-600" />
                <span>I&apos;ve checked the message and who will receive it.</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-secondary" type="submit" formAction={checkSendCostAction} formNoValidate>
                  See the cost
                </button>
                <button className="btn btn-primary" type="submit">
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  Send message
                </button>
              </div>
            </form>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Absence texts" description="Parents get a text when their child is marked absent.">
            <form action={toggleAbsenceSmsAction} className="flex items-center justify-between gap-3">
              <input type="hidden" name="enabled" value={profile.absenceSmsEnabled ? "0" : "1"} />
              <span className="text-sm">{profile.absenceSmsEnabled ? <Badge tone="good">On</Badge> : <Badge>Off</Badge>}</span>
              <button className="btn btn-secondary btn-sm" type="submit">Turn {profile.absenceSmsEnabled ? "off" : "on"}</button>
            </form>
          </Card>

          <Card title="Sent messages" description="The latest 40">
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Messages you send will appear here.</p>
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
