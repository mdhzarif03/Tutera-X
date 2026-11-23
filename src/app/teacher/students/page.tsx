import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { listStudents } from "@/services/students";
import { Badge, Card, EmptyState, Flash, PageHeader, Pagination } from "@/components/ui";
import { pageParam, pick } from "@/lib/params";

export const metadata = { title: "Students" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const q = pick(sp, "q") ?? "";
  const archived = pick(sp, "archived") === "1";
  const page = pageParam(sp);
  const data = await listStudents(t.id, { q, page, archived });

  return (
    <>
      <PageHeader
        title={archived ? "Archived students" : "Students"}
        description="Search by name, username or guardian. Archived students keep their full history."
        actions={<Link className="btn btn-primary" href="/teacher/students/new">Add student</Link>}
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form className="flex flex-1 gap-2" role="search">
          <input type="search" name="q" defaultValue={q} placeholder="Search students" className="input max-w-sm" aria-label="Search students" />
          {archived ? <input type="hidden" name="archived" value="1" /> : null}
          <button className="btn btn-secondary" type="submit">Search</button>
        </form>
        <Link href={archived ? "/teacher/students" : "/teacher/students?archived=1"} className="text-sm font-medium text-teal-700 hover:underline">
          {archived ? "Show active students" : "Show archived students"}
        </Link>
      </div>

      <Card>
        {data.rows.length === 0 ? (
          <EmptyState
            title={archived ? "No archived students" : q ? "No matches" : "No students yet"}
            body={archived ? "Students you archive appear here." : q ? "Try a different name, username or guardian." : "Add your first student. They receive an activation link by SMS."}
          >
            {!archived && !q ? <Link className="btn btn-primary btn-sm" href="/teacher/students/new">Add the first student</Link> : null}
          </EmptyState>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Batches</th>
                  <th>Guardian</th>
                  <th>Status</th>
                  <th className="text-right">Monthly</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const s = r.student;
                  return (
                    <tr key={s.userId}>
                      <td>
                        <Link href={`/teacher/students/${s.userId}`} className="font-medium text-slate-900 hover:underline">{s.user.name}</Link>
                        <p className="text-xs text-slate-500">{s.user.username}</p>
                      </td>
                      <td>{s.className} · {s.version}</td>
                      <td className="text-slate-600">{s.batchMemberships.map((m) => m.batch.name).join(", ") || "—"}</td>
                      <td>{s.guardian.name}</td>
                      <td>
                        <Badge tone={s.user.status === "ACTIVE" ? "good" : s.user.status === "DISABLED" ? "neutral" : "warn"}>
                          {s.user.status === "PENDING_ACTIVATION" ? "awaiting activation" : s.user.status.toLowerCase()}
                        </Badge>
                      </td>
                      <td className="text-right tabular-nums">৳{Number(s.monthlyFee.toString()).toLocaleString("en-US")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Pagination basePath="/teacher/students" page={data.page} pages={data.pages} query={{ ...(q ? { q } : {}), ...(archived ? { archived: "1" } : {}) }} />
    </>
  );
}
