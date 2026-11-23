import { CalendarCheck2, CheckCheck, Save } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { markAllPresentAction, saveAttendanceAction } from "@/actions/teacher";
import { listBatches } from "@/services/batches";
import { getRoster } from "@/services/attendance";
import { Badge, Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { dhakaToday, formatDay, dateOnly } from "@/lib/dates";
import { pick } from "@/lib/params";
import { UserError } from "@/lib/errors";

export const metadata = { title: "Attendance" };

// Full class names, written out so Tailwind can detect them.
const OPTIONS = [
  {
    value: "PRESENT",
    label: "Present",
    dot: "bg-emerald-500",
    on: "peer-checked:bg-emerald-500 peer-checked:text-white peer-checked:shadow-emerald-600/30",
  },
  {
    value: "ABSENT",
    label: "Absent",
    dot: "bg-rose-500",
    on: "peer-checked:bg-rose-500 peer-checked:text-white peer-checked:shadow-rose-600/30",
  },
  {
    value: "LATE",
    label: "Late",
    dot: "bg-amber-400",
    on: "peer-checked:bg-amber-400 peer-checked:text-amber-950 peer-checked:shadow-amber-500/30",
  },
  {
    value: "EXCUSED",
    label: "Excused",
    dot: "bg-slate-400",
    on: "peer-checked:bg-slate-600 peer-checked:text-white peer-checked:shadow-slate-600/30",
  },
] as const;

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const batches = await listBatches(t.id, false);
  const batchId = pick(sp, "batch") ?? batches[0]?.id ?? "";
  const date = pick(sp, "date") ?? dhakaToday();

  let roster: Awaited<ReturnType<typeof getRoster>> | null = null;
  let rosterError: string | null = null;
  if (batchId) {
    try {
      dateOnly(date);
      roster = await getRoster(t.id, batchId, date);
    } catch (err) {
      rosterError = err instanceof UserError ? err.message : "Could not load this batch.";
    }
  }
  const counts = roster
    ? roster.rows.reduce<Record<string, number>>((acc, r) => {
        if (r.status) acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {})
    : {};
  const marked = roster ? roster.rows.filter((r) => r.status).length : 0;

  return (
    <>
      <PageHeader
        eyebrow="Daily register"
        title="Attendance"
        description="Choose a batch and date, mark each student, then save. Absence notices go to guardians straight after saving."
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      {batches.length === 0 ? (
        <EmptyState
          title="Create a batch first"
          body="Attendance is recorded per batch. Create a batch and add students to it."
          icon={<CalendarCheck2 className="h-6 w-6" aria-hidden="true" />}
        />
      ) : (
        <>
          <form className="card mb-6 flex flex-wrap items-end gap-4 p-5" role="search">
            <div className="min-w-56 flex-1">
              <label htmlFor="batch" className="label">Batch</label>
              <select id="batch" name="batch" defaultValue={batchId} className="select">
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="date" className="label">Date</label>
              <input id="date" name="date" type="date" defaultValue={date} max={dhakaToday()} className="input" />
            </div>
            <button className="btn btn-secondary" type="submit">
              Open register
            </button>
          </form>

          {rosterError ? <p className="mb-4 text-sm font-medium text-rose-700">{rosterError}</p> : null}

          {roster && roster.rows.length === 0 ? (
            <EmptyState title="No students in this batch" body="Add students to the batch first, then come back to mark them." />
          ) : null}

          {roster && roster.rows.length > 0 ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-slate-900">{roster.batch.name}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">{formatDay(dateOnly(date))}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-600">
                  {marked} of {roster.rows.length} marked
                </span>
                <span className="ml-auto flex flex-wrap gap-2">
                  <Badge tone="good">{counts.PRESENT ?? 0} present</Badge>
                  <Badge tone="bad">{counts.ABSENT ?? 0} absent</Badge>
                  <Badge tone="warn">{counts.LATE ?? 0} late</Badge>
                </span>
              </div>

              <form action={saveAttendanceAction}>
                <input type="hidden" name="batchId" value={roster.batch.id} />
                <input type="hidden" name="date" value={date} />
                <Card>
                  <ul className="tx-stagger divide-y divide-slate-100">
                    {roster.rows.map((r) => {
                      const current = r.status ?? "PRESENT";
                      const initials = r.name.split(" ").map((p) => p.charAt(0)).slice(0, 2).join("").toUpperCase();
                      return (
                        <li key={r.studentId} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-sm font-bold text-indigo-700 ring-1 ring-indigo-100" aria-hidden="true">
                              {initials}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{r.name}</p>
                              <p className="text-xs text-slate-500">
                                {r.username ?? ""}
                                {r.status ? "" : " · not yet marked"}
                              </p>
                            </div>
                          </div>
                          <fieldset className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
                            <legend className="sr-only">Status for {r.name}</legend>
                            {OPTIONS.map((o) => (
                              <label key={o.value} className="cursor-pointer">
                                <input type="radio" name={`s_${r.studentId}`} value={o.value} defaultChecked={current === o.value} className="peer sr-only" />
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-none transition duration-200 hover:text-slate-900 peer-checked:shadow-md peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-500 ${o.on}`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${o.dot}`} aria-hidden="true" />
                                  {o.label}
                                </span>
                              </label>
                            ))}
                          </fieldset>
                        </li>
                      );
                    })}
                  </ul>
                </Card>

                <div className="sticky bottom-4 mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-white/90 p-3 shadow-lg shadow-indigo-900/10 ring-1 ring-slate-200 backdrop-blur-xl">
                  <button className="btn btn-primary" type="submit">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save attendance
                  </button>
                  <span className="text-xs text-slate-500">Unchanged records are left as they are.</span>
                </div>
              </form>

              <form action={markAllPresentAction} className="mt-3">
                <input type="hidden" name="batchId" value={roster.batch.id} />
                <input type="hidden" name="date" value={date} />
                <button className="btn btn-secondary btn-sm" type="submit">
                  <CheckCheck className="h-4 w-4" aria-hidden="true" />
                  Mark everyone present and save
                </button>
              </form>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
