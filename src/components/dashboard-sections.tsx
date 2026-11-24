import Link from "next/link";
import { Award, CalendarCheck, CalendarClock, GraduationCap, Layers, MessageCircle, Wallet } from "lucide-react";
import type { studentDashboard } from "@/services/dashboards";
import { Badge, Bars, Card, EmptyState, Stat } from "./ui";
import { formatDay } from "@/lib/dates";
import { formatTaka } from "@/lib/money";

export type StudentDashboardData = Awaited<ReturnType<typeof studentDashboard>>;

const STATUS: Record<string, { label: string; tone: "good" | "bad" | "neutral" }> = {
  PRESENT: { label: "Present", tone: "good" },
  ABSENT: { label: "Absent", tone: "bad" },
  LATE: { label: "Late", tone: "neutral" },
  EXCUSED: { label: "Excused", tone: "neutral" },
};

/** Read-only overview shared by the student and parent dashboards. */
export function DashboardOverview({
  data,
  basePath,
  showGroupLinks = false,
}: {
  data: StudentDashboardData;
  basePath: string;
  /** Shows each batch's WhatsApp join button. Enabled on the student's own dashboard only. */
  showGroupLinks?: boolean;
}) {
  const latest = data.performance[data.performance.length - 1];
  const balance = data.balance?.balance ?? 0;
  const chart = data.performance.slice(-8).map((p) => ({
    label: formatDay(p.examDate).replace(/ \d{4}$/, ""),
    value: p.absent ? 0 : p.percentage,
  }));

  return (
    <div className="space-y-6">
      <div className="tx-stagger grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Attendance"
          icon={<CalendarCheck className="h-4 w-4" aria-hidden="true" />}
          tone="good"
          value={data.attendance.percentage === null ? "—" : `${data.attendance.percentage}%`}
          hint={data.attendance.percentage === null ? "No days recorded yet" : `${data.attendance.counts.ABSENT} absent day${data.attendance.counts.ABSENT === 1 ? "" : "s"}`}
        />
        <Stat
          label="Latest result"
          icon={<Award className="h-4 w-4" aria-hidden="true" />}
          tone="brand"
          value={latest ? (latest.absent ? "Absent" : `${latest.percentage}%`) : "—"}
          hint={latest?.name ?? "Your results will show here"}
        />
        <Stat
          label="Upcoming exams"
          icon={<GraduationCap className="h-4 w-4" aria-hidden="true" />}
          tone="info"
          value={data.upcoming.length}
          hint={data.upcoming.length ? "Scheduled ahead" : "Nothing scheduled"}
        />
        <Stat
          label="Still to pay"
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
          tone={balance > 0 ? "warn" : "good"}
          value={formatTaka(Math.max(0, balance))}
          hint={balance <= 0 ? "All paid up" : "Amount to pay"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Performance" description="Your scores in recent exams" className="lg:col-span-2" icon={<Award className="h-4 w-4" aria-hidden="true" />}>
          {chart.length === 0 ? (
            <EmptyState title="No published results yet" body="Your scores will appear here after your teacher shares them." />
          ) : (
            <>
              <Bars items={chart} />
              <div className="-mx-5 mt-5 overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Exam</th>
                      <th>Date</th>
                      <th className="text-right">Marks</th>
                      <th className="text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.performance.slice().reverse().slice(0, 6).map((p) => (
                      <tr key={p.examId}>
                        <td>
                          <span className="font-medium text-slate-900">{p.name}</span>
                          <span className="ml-2 text-xs text-slate-500">{p.subject}</span>
                        </td>
                        <td className="whitespace-nowrap">{formatDay(p.examDate)}</td>
                        <td className="text-right tabular-nums">{p.absent ? "Absent" : `${p.obtained} / ${p.total}`}</td>
                        <td className="text-right">
                          {p.absent ? <Badge>—</Badge> : <Badge tone={p.percentage >= 40 ? "good" : "bad"}>{p.percentage}%</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {basePath ? (
                <Link href={`${basePath}/exams`} className="mt-4 inline-flex text-sm font-semibold text-indigo-600 hover:text-indigo-700">
                  View all results →
                </Link>
              ) : null}
            </>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Upcoming exams" icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}>
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">No exams scheduled.</p>
            ) : (
              <ul className="space-y-3">
                {data.upcoming.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-center text-[11px] font-bold leading-tight text-indigo-700 shadow-sm ring-1 ring-indigo-100">
                      {formatDay(e.examDate).split(" ")[0]}
                      <span className="block text-[9px] font-semibold uppercase text-slate-500">{formatDay(e.examDate).split(" ")[1]}</span>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{e.name}</p>
                      <p className="text-xs text-slate-500">
                        {e.subject} · {e.examTime}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Batches" icon={<Layers className="h-4 w-4" aria-hidden="true" />}>
            {data.batches.length === 0 ? (
              <p className="text-sm text-slate-500">Not in a class yet.</p>
            ) : (
              <ul className="space-y-4">
                {data.batches.map((b) => (
                  <li key={b.id}>
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg grad-brand text-xs font-bold text-white">
                        {b.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{b.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {b.subject ?? "General"} · {b.teacher.user.name}
                        </p>
                      </div>
                    </div>
                    {showGroupLinks && b.whatsappLink ? (
                      <a
                        href={b.whatsappLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm mt-2.5 w-full justify-center text-emerald-700"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        Join WhatsApp group
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Recent attendance" description="Latest 30 recorded days" className="lg:col-span-3" icon={<CalendarCheck className="h-4 w-4" aria-hidden="true" />}>
          {data.attendance.rows.length === 0 ? (
            <p className="text-sm text-slate-500">Your attendance will show here.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Batch</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.attendance.rows.slice(0, 30).map((r, i) => (
                    <tr key={`${r.date.toISOString()}-${i}`}>
                      <td className="whitespace-nowrap">{formatDay(r.date)}</td>
                      <td>{r.batch.name}</td>
                      <td>
                        <Badge tone={STATUS[r.status]?.tone ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
