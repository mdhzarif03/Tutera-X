import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  GraduationCap,
  MessageSquare,
  Plus,
  Users,
  Wallet,
} from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { teacherOverview } from "@/services/dashboards";
import { Badge, Card, EmptyState, Stat } from "@/components/ui";
import { formatDay, TZ } from "@/lib/dates";
import { formatTaka, num } from "@/lib/money";

export const metadata = { title: "Overview" };

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hour12: false }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

export default async function TeacherOverview() {
  const t = await requireRole("TEACHER");
  const o = await teacherOverview(t.id);
  const present = o.todayCounts.PRESENT ?? 0;
  const absent = o.todayCounts.ABSENT ?? 0;
  const firstName = t.name.split(" ")[0] ?? t.name;

  return (
    <div className="space-y-8">
      <section className="tx-enter relative overflow-hidden rounded-3xl grad-hero p-7 text-white shadow-xl shadow-indigo-900/20 sm:p-9">
        <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl" aria-hidden="true" />
        <div className="absolute bottom-0 right-40 h-40 w-40 rounded-full bg-violet-400/20 blur-2xl" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-200">{todayLabel()}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              {greeting()}, {firstName}.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-indigo-100/90">
              {absent > 0
                ? `${absent} student${absent === 1 ? " is" : "s are"} marked absent today. Guardians have been notified automatically.`
                : present > 0
                  ? `${present} student${present === 1 ? "" : "s"} marked present so far today. Everything is on track.`
                  : "Start with today's attendance, or check upcoming exams below."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/teacher/attendance" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-900 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:shadow-xl">
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              Take attendance
            </Link>
            <Link href="/teacher/students/new" className="inline-flex items-center gap-2 rounded-xl bg-white/12 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-inset ring-white/25 transition hover:bg-white/20">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add student
            </Link>
          </div>
        </div>
      </section>

      {o.allowance && o.allowance.overdrawn > 0 ? (
        <div role="alert" className="tx-pop flex items-start gap-3 rounded-2xl bg-rose-50 px-5 py-4 text-sm text-rose-900 ring-1 ring-inset ring-rose-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" aria-hidden="true" />
          <span>
            Your SMS allowance is overdrawn by {o.allowance.overdrawn} credits because the provider billed more than estimated. Sending is paused until the owner adds credits.
          </span>
        </div>
      ) : null}
      {o.allowance && o.allowance.remaining === 0 && o.allowance.overdrawn === 0 ? (
        <div role="status" className="tx-pop flex items-start gap-3 rounded-2xl bg-amber-50 px-5 py-4 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            Your SMS allowance is used up. Attendance and results still save, but guardian notices are not sent until the owner adds credits.
          </span>
        </div>
      ) : null}

      <div className="tx-stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Active students" tone="brand" icon={<Users className="h-4 w-4" aria-hidden="true" />} value={o.activeStudents} hint={`${o.activeBatches} active batch${o.activeBatches === 1 ? "" : "es"}`} />
        <Stat label="Present today" tone="good" icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />} value={present} hint={absent ? `${absent} absent` : "No absences recorded"} />
        <Stat label="Outstanding fees" tone={o.outstanding > 0 ? "warn" : "good"} icon={<Wallet className="h-4 w-4" aria-hidden="true" />} value={formatTaka(o.outstanding)} hint="Across all active students" />
        <Stat
          label="SMS credits left"
          tone="info"
          icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
          value={o.allowance ? o.allowance.remaining.toLocaleString("en-US") : 0}
          hint={o.sms.credits === null ? "Provider balance not yet fetched" : `Shared account: ${o.sms.credits.toLocaleString("en-US")}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          title="Upcoming exams"
          description="The next two weeks"
          className="lg:col-span-2"
          icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}
          actions={
            <Link href="/teacher/exams" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              All exams <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
        >
          {o.upcomingExams.length === 0 ? (
            <EmptyState
              title="No exams in the next two weeks"
              body="Schedule an exam and students are notified by SMS straight away."
              icon={<GraduationCap className="h-6 w-6" aria-hidden="true" />}
            >
              <Link className="btn btn-primary btn-sm" href="/teacher/exams">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Schedule an exam
              </Link>
            </EmptyState>
          ) : (
            <ul className="tx-stagger space-y-3">
              {o.upcomingExams.map((e) => {
                const [day, month] = formatDay(e.examDate).split(" ");
                return (
                  <li key={e.id}>
                    <Link href={`/teacher/exams/${e.id}`} className="card card-interactive flex items-center gap-4 p-4">
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl grad-brand text-center text-white shadow-md shadow-indigo-600/25">
                        <span>
                          <span className="block text-lg font-bold leading-none">{day}</span>
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-indigo-100">{month}</span>
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900">{e.name}</p>
                        <p className="text-sm text-slate-500">
                          {e.subject} · {e.examTime}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent payments" icon={<Wallet className="h-4 w-4" aria-hidden="true" />}>
          {o.recentPayments.length === 0 ? (
            <p className="text-sm text-slate-500">Payments you record appear here.</p>
          ) : (
            <ul className="space-y-3">
              {o.recentPayments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{p.student.user.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatDay(p.paidOn)} · {p.method.toLowerCase().replace("_", " ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-emerald-700">{formatTaka(num(p.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent messages" className="lg:col-span-3" icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}>
          {o.recentMessages.length === 0 ? (
            <p className="text-sm text-slate-500">Messages you send and automatic notices appear here.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {o.recentMessages.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-100">
                  <span className="truncate text-sm capitalize text-slate-700">{m.smsMessage.purpose.replace(/_/g, " ").toLowerCase()}</span>
                  <Badge tone={m.status === "FAILED" ? "bad" : m.status === "SENT" || m.status === "ACCEPTED" ? "good" : "neutral"}>
                    {m.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
