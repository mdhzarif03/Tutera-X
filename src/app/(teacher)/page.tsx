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
import { Badge, EmptyState } from "@/components/ui";
import { formatDay, TZ } from "@/lib/dates";
import { shortMessagesLeft } from "@/lib/sms/balance";
import { formatTaka } from "@/lib/money";
import { CollectionBars } from "@/components/collection-bars";

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

type Tone = "rose" | "amber" | "emerald" | "sky";
const TONE_CLASS: Record<Tone, { row: string; dot: string; link: string }> = {
  rose: { row: "bg-rose-50 ring-rose-100", dot: "bg-rose-500", link: "text-rose-700" },
  amber: { row: "bg-amber-50 ring-amber-100", dot: "bg-amber-500", link: "text-amber-800" },
  emerald: { row: "bg-emerald-50 ring-emerald-100", dot: "bg-emerald-500", link: "text-emerald-800" },
  sky: { row: "bg-sky-50 ring-sky-100", dot: "bg-sky-500", link: "text-sky-800" },
};

export default async function TeacherOverview() {
  const t = await requireRole("TEACHER");
  const o = await teacherOverview(t.id);
  const present = o.todayCounts.PRESENT ?? 0;
  const absent = o.todayCounts.ABSENT ?? 0;
  const late = o.todayCounts.LATE ?? 0;
  const excused = o.todayCounts.EXCUSED ?? 0;
  const marked = present + absent + late + excused;
  const failed = o.recentMessages.filter((m) => m.status === "FAILED").length;
  const firstName = t.name.split(" ")[0] ?? t.name;

  // Only things that need a decision today. Each links to where it is fixed.
  const attention: { tone: Tone; text: string; href: string; cta: string }[] = [];
  const left = shortMessagesLeft(o.sms.credits);
  if (o.sms.credits !== null && o.sms.credits <= 0 && o.sms.status === "ok") {
    attention.push({ tone: "rose", text: "The message balance is empty, so parent texts cannot be sent. Top up at nishchit.tech.", href: "/sms", cta: "See balance" });
  } else if (left !== null && left > 0 && left < 50) {
    attention.push({ tone: "amber", text: `Only about ${left} short messages are left. Top up soon.`, href: "/sms", cta: "See balance" });
  }
  if (o.outstanding > 0) {
    attention.push({ tone: "amber", text: `${formatTaka(o.outstanding)} is still to collect from students.`, href: "/payments", cta: "Record payments" });
  }
  if (failed > 0) {
    attention.push({ tone: "rose", text: `${failed} message${failed === 1 ? " could" : "s could"} not be sent.`, href: "/sms", cta: "See messages" });
  }
  if (o.upcomingExams.length > 0 && o.activeStudents > 0) {
    attention.push({ tone: "sky", text: `${o.upcomingExams.length} exam${o.upcomingExams.length === 1 ? "" : "s"} coming up in the next two weeks.`, href: "/exams", cta: "View exams" });
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{todayLabel()}</p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            {greeting()}, {firstName}.
          </h1>
          <p className="mt-2 text-base text-slate-500">
            {absent > 0
              ? `${absent} student${absent === 1 ? " is" : "s are"} absent today. Their parents have been let know.`
              : marked > 0
                ? `${marked} student${marked === 1 ? "" : "s"} marked today. No absences so far.`
                : "Nothing marked yet today. Start with the register."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link href="/attendance" className="btn btn-primary">
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            Take attendance
          </Link>
          <Link href="/students/new" className="btn btn-secondary">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add student
          </Link>
        </div>
      </section>

      <section className="tx-stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi label="Students" value={o.activeStudents} hint={`${o.activeBatches} active batch${o.activeBatches === 1 ? "" : "es"}`} icon={<Users className="h-5 w-5" aria-hidden="true" />} tone="indigo" />
        <Kpi
          label="Present today"
          value={present}
          hint={marked > 0 ? `of ${marked} marked` : "Not marked yet"}
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
          tone="emerald"
          progress={marked > 0 ? Math.round((present / marked) * 100) : undefined}
        />
        <Kpi label="Still to collect" value={formatTaka(o.outstanding)} hint="Across all students" icon={<Wallet className="h-5 w-5" aria-hidden="true" />} tone={o.outstanding > 0 ? "amber" : "emerald"} />
        <Kpi
          label="Messages left"
          value={shortMessagesLeft(o.sms.credits)?.toLocaleString("en-US") ?? "—"}
          hint="Short messages left in the shared balance"
          icon={<MessageSquare className="h-5 w-5" aria-hidden="true" />}
          tone="sky"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="card p-6 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Upcoming exams</h2>
              <p className="text-sm text-slate-500">Next two weeks</p>
            </div>
            <Link href="/exams" className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              All exams <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          {o.upcomingExams.length === 0 ? (
            <EmptyState title="No exams coming up" body="When you add an exam, students get a text straight away." icon={<GraduationCap className="h-6 w-6" aria-hidden="true" />}>
              <Link className="btn btn-primary btn-sm" href="/exams">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add an exam
              </Link>
            </EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {o.upcomingExams.map((e) => {
                const [day, month] = formatDay(e.examDate).split(" ");
                return (
                  <li key={e.id}>
                    <Link href={`/exams/${e.id}`} className="group flex items-center gap-4 py-4 transition hover:bg-slate-50/70">
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-center ring-1 ring-inset ring-indigo-100">
                        <span>
                          <span className="block text-lg font-bold leading-none text-indigo-700">{day}</span>
                          <span className="block text-[10px] font-semibold uppercase tracking-wider text-indigo-500">{month}</span>
                        </span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-900 group-hover:text-indigo-700">{e.name}</p>
                        <p className="text-sm text-slate-500">
                          {e.subject} · {e.examTime}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-base font-semibold text-slate-900">To check today</h2>
          <p className="mb-5 text-sm text-slate-500">Only what needs you today.</p>
          {attention.length === 0 ? (
            <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-inset ring-emerald-100">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
              <p className="text-sm font-medium text-emerald-900">All done for today. Nothing needs you right now.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {attention.map((a) => (
                <li key={a.text} className={`rounded-2xl p-4 ring-1 ring-inset ${TONE_CLASS[a.tone].row}`}>
                  <div className="flex gap-3">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_CLASS[a.tone].dot}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm leading-relaxed text-slate-800">{a.text}</p>
                      <Link href={a.href} className={`mt-2 inline-flex items-center gap-1 text-sm font-semibold ${TONE_CLASS[a.tone].link} hover:underline`}>
                        {a.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Collections by month</h2>
              <p className="text-sm text-slate-500">Money received, last 12 months</p>
            </div>
            <Link href="/payments" className="shrink-0 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              Open payments
            </Link>
          </div>
          <CollectionBars items={o.collections} />
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
            <div>
              <p className="text-xs font-medium text-slate-500">This month</p>
              <p className="font-bold tabular-nums text-emerald-700">{formatTaka(o.collections[o.collections.length - 1]?.amount ?? 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-slate-500">Last 12 months</p>
              <p className="font-bold tabular-nums text-slate-900">{formatTaka(o.collections.reduce((s, c) => s + c.amount, 0))}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Recent messages</h2>
            <Link href="/sms" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
              Open messages
            </Link>
          </div>
          {o.recentMessages.length === 0 ? (
            <p className="text-sm text-slate-500">Messages you send will appear here.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {o.recentMessages.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                  <span className="truncate text-sm capitalize text-slate-700">{m.smsMessage.purpose.replace(/_/g, " ").toLowerCase()}</span>
                  <Badge tone={m.status === "FAILED" ? "bad" : m.status === "SENT" || m.status === "ACCEPTED" ? "good" : "neutral"}>
                    {m.status.toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

const KPI_TONE: Record<string, { tile: string; bar: string }> = {
  indigo: { tile: "bg-indigo-50 text-indigo-600 ring-indigo-100", bar: "bg-indigo-500" },
  emerald: { tile: "bg-emerald-50 text-emerald-600 ring-emerald-100", bar: "bg-emerald-500" },
  amber: { tile: "bg-amber-50 text-amber-600 ring-amber-100", bar: "bg-amber-500" },
  sky: { tile: "bg-sky-50 text-sky-600 ring-sky-100", bar: "bg-sky-500" },
};

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
  progress,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  icon: React.ReactNode;
  tone: keyof typeof KPI_TONE;
  progress?: number;
}) {
  const t = KPI_TONE[tone] ?? KPI_TONE.indigo;
  return (
    <div className="card card-interactive p-5">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={`grid h-10 w-10 place-items-center rounded-xl ring-1 ring-inset ${t?.tile}`}>{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      {progress !== undefined ? (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div className={`tx-track h-full rounded-full ${t?.bar}`} style={{ width: `${progress}%` }} />
        </div>
      ) : null}
    </div>
  );
}
