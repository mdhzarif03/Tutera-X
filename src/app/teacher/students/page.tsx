import Link from "next/link";
import { Archive, UserPlus, Search, Users } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { listStudents } from "@/services/students";
import { deleteStudentAction } from "@/actions/teacher";
import { ConfirmAction } from "@/components/confirm-action";
import { Badge, Card, EmptyState, Flash, PageHeader, Pagination } from "@/components/ui";
import { pageParam, pick } from "@/lib/params";
import { formatTaka, num } from "@/lib/money";

export const metadata = { title: "Students" };

const STATUS: Record<string, { label: string; tone: "good" | "warn" | "neutral" }> = {
  ACTIVE: { label: "Active", tone: "good" },
  PENDING_ACTIVATION: { label: "Not joined yet", tone: "warn" },
  DISABLED: { label: "Archived", tone: "neutral" },
};

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
        description="Find someone by name, login ID or guardian phone. Archived students keep their records."
        actions={
          <Link href="/teacher/students/new" className="btn btn-primary">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add student
          </Link>
        }
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <form className="flex flex-1 flex-wrap gap-2" role="search">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="search" name="q" defaultValue={q} placeholder="Search by name, login ID or guardian phone" className="input pl-10" aria-label="Search students" />
          </div>
          {archived ? <input type="hidden" name="archived" value="1" /> : null}
          <button className="btn btn-secondary" type="submit">
            Search
          </button>
        </form>
        <Link
          href={archived ? "/teacher/students" : "/teacher/students?archived=1"}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
        >
          <Archive className="h-4 w-4" aria-hidden="true" />
          {archived ? "Show active students" : "Show archived students"}
        </Link>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          title={archived ? "No archived students" : q ? "No matching students" : "No students yet"}
          body={archived ? "Archived students appear here. Their records stay safe." : q ? "Try a different name or login ID." : "Add your first student. We'll text them a welcome link."}
          icon={<Users className="h-6 w-6" aria-hidden="true" />}
        >
          {!archived && !q ? (
            <Link className="btn btn-primary btn-sm" href="/teacher/students/new">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Add the first student
            </Link>
          ) : null}
        </EmptyState>
      ) : (
        <Card>
          <div className="-mx-5 overflow-x-auto">
            <table className="tbl min-w-[760px]">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Batches</th>
                  <th>Guardian phone</th>
                  <th>Status</th>
                  <th className="text-right">Monthly fee</th>
                  <th className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const s = r.student;
                  const initials = s.user.name.split(" ").map((p) => p.charAt(0)).slice(0, 2).join("").toUpperCase();
                  const st = STATUS[s.user.status] ?? { label: s.user.status, tone: "neutral" as const };
                  return (
                    <tr key={s.userId}>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-700 ring-1 ring-indigo-100" aria-hidden="true">
                            {initials}
                          </span>
                          <div className="min-w-0">
                            <Link href={`/teacher/students/${s.userId}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                              {s.user.name}
                            </Link>
                            <p className="font-mono text-xs text-slate-500">{s.user.username}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <p className="text-slate-800">{s.className}</p>
                        <p className="text-xs text-slate-500">{s.version}</p>
                      </td>
                      <td>
                        {s.batchMemberships.length === 0 ? (
                          <span className="text-slate-400">None</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {s.batchMemberships.map((m) => (
                              <Badge key={m.batch.name} tone="brand">
                                {m.batch.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="text-slate-700">{s.guardian.phoneE164}</td>
                      <td>
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="text-right font-semibold tabular-nums text-slate-900">{formatTaka(num(s.monthlyFee))}</td>
                      <td className="text-right">
                        <ConfirmAction
                          action={deleteStudentAction}
                          hidden={{ studentId: s.userId }}
                          label="Delete"
                          question={`Delete ${s.user.name}? If they have any records, we'll archive them instead so nothing is lost.`}
                          confirmLabel="Yes, delete"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Pagination basePath="/teacher/students" page={data.page} pages={data.pages} query={{ ...(q ? { q } : {}), ...(archived ? { archived: "1" } : {}) }} />
    </>
  );
}
