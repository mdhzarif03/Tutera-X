import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { teacherOverview } from "@/services/dashboards";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { formatTaka, num } from "@/lib/money";

export const metadata = { title: "Overview" };

export default async function TeacherOverview() {
  const t = await requireRole("TEACHER");
  const o = await teacherOverview(t.id);
  const present = o.todayCounts.PRESENT ?? 0;
  const absent = o.todayCounts.ABSENT ?? 0;

  return (
    <>
      <PageHeader
        title={`Welcome, ${t.name.split(" ")[0] ?? t.name}`}
        description="Today at a glance."
        actions={
          <>
            <Link className="btn btn-secondary" href="/teacher/attendance">Take attendance</Link>
            <Link className="btn btn-primary" href="/teacher/students/new">Add student</Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active students" value={o.activeStudents} />
        <Stat label="Active batches" value={o.activeBatches} />
        <Stat label="Present today" value={present} hint={absent ? `${absent} absent` : "No absences recorded"} />
        <Stat label="Outstanding fees" value={formatTaka(o.outstanding)} />
      </div>

      {o.allowance && o.allowance.overdrawn > 0 ? (
        <div role="alert" className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-inset ring-rose-200">
          Your SMS allowance is overdrawn by {o.allowance.overdrawn} credits because the provider billed more than estimated. Sending is paused until the owner adds credits.
        </div>
      ) : null}
      {o.allowance && o.allowance.remaining === 0 && o.allowance.overdrawn === 0 ? (
        <div role="status" className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          Your SMS allowance is used up. Attendance and results still save, but guardian notices are not sent until the owner adds credits.
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="SMS credits" description="Shared Tutera-X account" className="lg:col-span-1">
          {o.sms.credits === null ? (
            <p className="text-sm text-slate-600">No balance yet. Open the SMS page to check the connection.</p>
          ) : (
            <p className="text-3xl font-semibold tabular-nums">{o.sms.credits.toLocaleString("en-US")}</p>
          )}
          <p className="mt-2 text-xs text-slate-500">
            {o.sms.status === "ok" ? "Connected." : o.sms.status === "not_configured" ? "Provider not configured." : "Could not reach the provider. Showing the last known balance."}
          </p>
          <p className="mt-3 text-sm text-slate-700">
            Your allowance: <strong className="tabular-nums">{o.allowance ? o.allowance.remaining.toLocaleString("en-US") : 0}</strong> credits left
          </p>
          <Link href="/teacher/sms" className="mt-3 inline-block text-sm font-medium text-teal-700 hover:underline">Manage SMS</Link>
        </Card>

        <Card title="Upcoming exams" description="Next 14 days" className="lg:col-span-2">
          {o.upcomingExams.length === 0 ? (
            <EmptyState title="No exams in the next two weeks" body="Scheduled exams appear here, and students are notified by SMS when you create one.">
              <Link className="btn btn-secondary btn-sm" href="/teacher/exams">Schedule an exam</Link>
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {o.upcomingExams.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <Link href={`/teacher/exams/${e.id}`} className="text-sm font-medium text-slate-900 hover:underline">{e.name}</Link>
                    <p className="text-xs text-slate-500">{e.subject}</p>
                  </div>
                  <p className="text-sm tabular-nums text-slate-700">{formatDay(e.examDate)} · {e.examTime}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent payments" className="lg:col-span-1">
          {o.recentPayments.length === 0 ? (
            <p className="text-sm text-slate-600">No payments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {o.recentPayments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 py-2">
                  <span className="truncate">{p.student.user.name}</span>
                  <span className="tabular-nums">{formatTaka(num(p.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent messages" className="lg:col-span-2">
          {o.recentMessages.length === 0 ? (
            <p className="text-sm text-slate-600">Messages you send and automatic notices appear here.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {o.recentMessages.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="truncate text-slate-700">{m.smsMessage.purpose.replace(/_/g, " ").toLowerCase()}</span>
                  <Badge tone={m.status === "FAILED" ? "bad" : m.status === "SENT" || m.status === "ACCEPTED" ? "good" : "neutral"}>{m.status.toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
