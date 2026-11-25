import Link from "next/link";
import { Fragment } from "react";
import { Archive, UserPlus, Search, Users } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { listStudents } from "@/services/students";
import { deleteStudentAction } from "@/actions/teacher";
import { ConfirmAction } from "@/components/confirm-action";
import { Badge, Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { QuerySelect } from "@/components/query-select";
import { ActiveFilters, FilterPanel, HiddenFields } from "@/components/filter-panel";
import { groupRows, NONE_KEY, parseSort, type GroupKey } from "@/lib/sort";
import { hrefWith, matchesAll, multi, optionsFrom, selectionQuery, type FilterGroup, type Query } from "@/lib/filters";
import { pick } from "@/lib/params";
import { formatTaka, num } from "@/lib/money";

export const metadata = { title: "Students" };

const STATUS: Record<string, { label: string; tone: "good" | "warn" | "neutral"; rank: string }> = {
  ACTIVE: { label: "Active", tone: "good", rank: "1" },
  PENDING_ACTIVATION: { label: "Not joined yet", tone: "warn", rank: "2" },
  DISABLED: { label: "Archived", tone: "neutral", rank: "3" },
};

const SORTS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "class", label: "Class" },
  { value: "batch", label: "Batch" },
  { value: "status", label: "Status" },
] as const;

type StudentRow = Awaited<ReturnType<typeof listStudents>>["rows"][number];

const batchNamesOf = (r: StudentRow) => {
  const names = r.student.batchMemberships.map((m) => m.batch.name);
  return names.length ? names : [NONE_KEY];
};

function keysFor(sort: string, r: StudentRow): GroupKey[] {
  const s = r.student;
  if (sort === "class") return [{ key: s.className, label: s.className, rank: s.className }];
  if (sort === "batch") {
    return s.batchMemberships.length
      ? s.batchMemberships.map((m) => ({ key: m.batch.name, label: m.batch.name, rank: m.batch.name }))
      : [{ key: NONE_KEY, label: "No batch", rank: "" }];
  }
  const st = STATUS[s.user.status];
  return [{ key: s.user.status, label: st?.label ?? s.user.status, rank: st?.rank ?? "9" }];
}

export default async function StudentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const q = pick(sp, "q") ?? "";
  const archived = pick(sp, "archived") === "1";
  const sort = parseSort(pick(sp, "sort"), SORTS.map((s) => s.value), "name");
  const data = await listStudents(t.id, { q, page: 1, archived });
  const all = data.rows;

  // Options come from every student in this view, so a choice stays visible while others are filtered.
  const groups: FilterGroup[] = [
    {
      name: "batch",
      title: "Batch",
      options: optionsFrom(all.flatMap(batchNamesOf), (v) => (v === NONE_KEY ? "No batch" : v)),
      selected: multi(sp, "batch"),
    },
    { name: "class", title: "Class", options: optionsFrom(all.map((r) => r.student.className)), selected: multi(sp, "class") },
    { name: "version", title: "Version", options: optionsFrom(all.map((r) => r.student.version)), selected: multi(sp, "version") },
    {
      name: "status",
      title: "Status",
      options: optionsFrom(all.map((r) => r.student.user.status), (v) => STATUS[v]?.label ?? v),
      selected: multi(sp, "status"),
    },
  ];
  const [batchG, classG, versionG, statusG] = groups as [FilterGroup, FilterGroup, FilterGroup, FilterGroup];

  const rows = all.filter((r) =>
    matchesAll([
      { selected: batchG.selected, values: batchNamesOf(r) },
      { selected: classG.selected, values: [r.student.className] },
      { selected: versionG.selected, values: [r.student.version] },
      { selected: statusG.selected, values: [r.student.user.status] },
    ]),
  );
  const groupsView = sort === "name" ? null : groupRows(rows, (r) => keysFor(sort, r));

  // Query pieces that must survive each kind of control.
  const filterQuery: Query = selectionQuery(groups);
  const keep: Query = {
    ...(q ? { q } : {}),
    ...(archived ? { archived: "1" } : {}),
    ...(sort !== "name" ? { sort } : {}),
  };
  const searchCarry: Query = { ...keep, q: undefined, ...filterQuery };

  const renderRow = (r: StudentRow) => {
    const s = r.student;
    const initials = s.user.name.split(" ").map((p) => p.charAt(0)).slice(0, 2).join("").toUpperCase();
    const st = STATUS[s.user.status] ?? { label: s.user.status, tone: "neutral" as const };
    return (
      <tr key={`${sort}-${s.userId}`}>
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
  };

  const noneMatch = all.length > 0 && rows.length === 0;

  return (
    <>
      <PageHeader
        title={archived ? "Archived students" : "Students"}
        description="Find someone by name, login ID or guardian phone. Filter by batch, class or version, and sort to see them grouped."
        actions={
          <Link href="/teacher/students/new" className="btn btn-primary">
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add student
          </Link>
        }
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="mb-5 space-y-3">
        <div className="card flex flex-wrap items-center gap-2 p-2.5">
          <form role="search" className="flex min-w-0 flex-1 basis-72 items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input type="search" name="q" defaultValue={q} placeholder="Search name, login ID or guardian phone" className="input pl-10" aria-label="Search students" />
            </div>
            <HiddenFields query={searchCarry} />
            <button className="btn btn-secondary" type="submit">
              Search
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <FilterPanel basePath="/teacher/students" groups={groups} keep={keep} />
            <QuerySelect paramKey="sort" label="Sort by" value={sort} options={[...SORTS]} defaultValue="name" />
          </div>
          <Link
            href={archived ? "/teacher/students" : "/teacher/students?archived=1"}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
          >
            <Archive className="h-4 w-4" aria-hidden="true" />
            {archived ? "Show active students" : "Show archived students"}
          </Link>
        </div>
        <ActiveFilters basePath="/teacher/students" groups={groups} keep={keep} shown={rows.length} total={all.length} />
      </div>

      {all.length === 0 ? (
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
      ) : noneMatch ? (
        <EmptyState title="No students match these filters" body="Remove a filter, or use Clear all to see everyone.">
          <Link className="btn btn-secondary btn-sm" href={hrefWith("/teacher/students", keep)}>
            Clear filters
          </Link>
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
                {groupsView
                  ? groupsView.map((g) => (
                      <Fragment key={g.key}>
                        <tr className="bg-slate-50">
                          <td colSpan={7} className="px-4 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-bold text-slate-900">{g.label}</span>
                              <span className="text-xs text-slate-500">
                                {g.rows.length} student{g.rows.length === 1 ? "" : "s"}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {g.rows.map(renderRow)}
                      </Fragment>
                    ))
                  : rows.map(renderRow)}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
