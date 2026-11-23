import { requireRole } from "@/lib/auth/guards";
import { attendanceSummary } from "@/services/attendance";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { formatDay } from "@/lib/dates";

export const metadata = { title: "Attendance" };

export default async function StudentAttendance() {
  const user = await requireRole("STUDENT");
  const a = await attendanceSummary(user.id);
  return (
    <>
      <PageHeader title="Attendance" description="Every day your teachers have recorded." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Attendance" value={a.percentage === null ? "—" : `${a.percentage}%`} hint="Excused days are not counted" />
        <Stat label="Present" value={a.counts.PRESENT} />
        <Stat label="Late" value={a.counts.LATE} />
        <Stat label="Absent" value={a.counts.ABSENT} />
      </div>
      <div className="mt-6">
        {a.rows.length === 0 ? (
          <EmptyState title="No attendance yet" body="Once your teacher records attendance, each day appears here." />
        ) : (
          <Card>
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Batch</th><th>Status</th></tr></thead>
                <tbody>
                  {a.rows.map((r, i) => (
                    <tr key={`${r.date.toISOString()}-${i}`}>
                      <td className="whitespace-nowrap">{formatDay(r.date)}</td>
                      <td>{r.batch.name}</td>
                      <td><Badge tone={r.status === "ABSENT" ? "bad" : r.status === "PRESENT" ? "good" : "neutral"}>{r.status.toLowerCase()}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
