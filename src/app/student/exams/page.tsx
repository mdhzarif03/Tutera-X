import { requireRole } from "@/lib/auth/guards";
import { studentDashboard } from "@/services/dashboards";
import { Bars, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDay } from "@/lib/dates";

export const metadata = { title: "Exams" };

export default async function StudentExams() {
  const user = await requireRole("STUDENT");
  const data = await studentDashboard(user.id);
  const chart = data.performance.map((p) => ({ label: formatDay(p.examDate).replace(/ \d{4}$/, ""), value: p.absent ? 0 : p.percentage }));
  return (
    <>
      <PageHeader title="Exams" description="Upcoming exams and your published results." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Upcoming" className="lg:col-span-1">
          {data.upcoming.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.upcoming.map((e) => (
                <li key={e.id} className="py-2.5">
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-slate-500">{e.subject} · {formatDay(e.examDate)} at {e.examTime}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Performance over time" className="lg:col-span-2">
          {chart.length === 0 ? (
            <EmptyState title="No published results" body="Results appear here after your teacher publishes them." />
          ) : (
            <Bars items={chart} />
          )}
        </Card>
      </div>
      {data.performance.length > 0 ? (
        <Card title="All results" className="mt-6">
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="tbl">
              <thead><tr><th>Exam</th><th>Subject</th><th>Date</th><th className="text-right">Marks</th><th className="text-right">%</th></tr></thead>
              <tbody>
                {data.performance.slice().reverse().map((p) => (
                  <tr key={p.examId}>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.subject}</td>
                    <td className="whitespace-nowrap">{formatDay(p.examDate)}</td>
                    <td className="text-right tabular-nums">{p.absent ? "Absent" : `${p.obtained} / ${p.total}`}</td>
                    <td className="text-right tabular-nums">{p.absent ? "—" : `${p.percentage}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </>
  );
}
