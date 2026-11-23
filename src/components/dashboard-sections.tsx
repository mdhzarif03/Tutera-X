import Link from "next/link";
import type { studentDashboard } from "@/services/dashboards";
import { Badge, Bars, Card, EmptyState, Stat } from "./ui";
import { formatDay } from "@/lib/dates";
import { formatTaka } from "@/lib/money";

export type StudentDashboardData = Awaited<ReturnType<typeof studentDashboard>>;

const STATUS: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", LATE: "Late", EXCUSED: "Excused" };

/** Overview blocks shared by the student and parent dashboards. Strictly read-only. */
export function DashboardOverview({ data, basePath }: { data: StudentDashboardData; basePath: string }) {
  const latest = data.performance[data.performance.length - 1];
  const balance = data.balance?.balance ?? 0;
  const chart = data.performance.slice(-8).map((p) => ({
    label: formatDay(p.examDate).replace(/ \d{4}$/, ""),
    value: p.absent ? 0 : p.percentage,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Attendance"
          value={data.attendance.percentage === null ? "—" : `${data.attendance.percentage}%`}
          hint={data.attendance.percentage === null ? "No days recorded yet" : `${data.attendance.counts.ABSENT} absent day${data.attendance.counts.ABSENT === 1 ? "" : "s"}`}
        />
        <Stat label="Latest result" value={latest ? (latest.absent ? "Absent" : `${latest.percentage}%`) : "—"} hint={latest?.name} />
        <Stat label="Upcoming exams" value={data.upcoming.length} />
        <Stat label="Balance due" value={formatTaka(Math.max(0, balance))} hint={balance <= 0 ? "All paid up" : "Balance outstanding"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Performance" description="Percentage in recent published exams" className="lg:col-span-2">
          {chart.length === 0 ? (
            <EmptyState title="No published results yet" body="When your teacher publishes results, your performance graph appears here." />
          ) : (
            <>
              <Bars items={chart} />
              <div className="mt-4 -mx-4 overflow-x-auto sm:-mx-5">
                <table className="tbl">
                  <thead><tr><th>Exam</th><th>Date</th><th className="text-right">Marks</th><th className="text-right">%</th></tr></thead>
                  <tbody>
                    {data.performance.slice().reverse().slice(0, 6).map((p) => (
                      <tr key={p.examId}>
                        <td>{p.name} <span className="text-xs text-slate-500">{p.subject}</span></td>
                        <td className="whitespace-nowrap">{formatDay(p.examDate)}</td>
                        <td className="text-right tabular-nums">{p.absent ? "Absent" : `${p.obtained} / ${p.total}`}</td>
                        <td className="text-right tabular-nums">{p.absent ? "—" : `${p.percentage}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {basePath ? <Link href={`${basePath}/exams`} className="mt-3 inline-block text-sm font-medium text-teal-700 hover:underline">All results</Link> : null}
            </>
          )}
        </Card>

        <Card title="Upcoming exams">
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-slate-600">No exams scheduled.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.upcoming.map((e) => (
                <li key={e.id} className="py-2.5">
                  <p className="font-medium text-slate-900">{e.name}</p>
                  <p className="text-xs text-slate-500">{e.subject} · {formatDay(e.examDate)} at {e.examTime}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Batches">
          {data.batches.length === 0 ? (
            <p className="text-sm text-slate-600">Not enrolled in a batch yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.batches.map((b) => (
                <li key={b.id}>
                  <p className="font-medium text-slate-900">{b.name}</p>
                  <p className="text-xs text-slate-500">{b.subject ?? "General"} · {b.teacher.user.name}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Attendance" className="lg:col-span-2" description="Latest 30 recorded days">
          {data.attendance.rows.length === 0 ? (
            <p className="text-sm text-slate-600">Attendance appears here once your teacher records it.</p>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Batch</th><th>Status</th></tr></thead>
                <tbody>
                  {data.attendance.rows.slice(0, 30).map((r, i) => (
                    <tr key={`${r.date.toISOString()}-${i}`}>
                      <td className="whitespace-nowrap">{formatDay(r.date)}</td>
                      <td>{r.batch.name}</td>
                      <td><Badge tone={r.status === "ABSENT" ? "bad" : r.status === "PRESENT" ? "good" : "neutral"}>{STATUS[r.status]}</Badge></td>
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
