import { requireRole } from "@/lib/auth/guards";
import { markAllPresentAction, saveAttendanceAction } from "@/actions/teacher";
import { listBatches } from "@/services/batches";
import { getRoster } from "@/services/attendance";
import { Badge, Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { dhakaToday, formatDay, dateOnly } from "@/lib/dates";
import { pick } from "@/lib/params";
import { UserError } from "@/lib/errors";

export const metadata = { title: "Attendance" };

const OPTIONS = [
  { value: "PRESENT", label: "Present", tone: "border-emerald-300 bg-emerald-50 text-emerald-900" },
  { value: "ABSENT", label: "Absent", tone: "border-rose-300 bg-rose-50 text-rose-900" },
  { value: "LATE", label: "Late", tone: "border-amber-300 bg-amber-50 text-amber-900" },
  { value: "EXCUSED", label: "Excused", tone: "border-slate-300 bg-slate-100 text-slate-800" },
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

  return (
    <>
      <PageHeader title="Attendance" description="Pick a batch and date, mark each student, then save. Absence notices go to guardians after saving." />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      {batches.length === 0 ? (
        <EmptyState title="Create a batch first" body="Attendance is recorded per batch. Create a batch and add students to it." />
      ) : (
        <>
          <form className="mb-5 flex flex-wrap items-end gap-3" role="search">
            <div className="min-w-56">
              <label htmlFor="batch" className="label">Batch</label>
              <select id="batch" name="batch" defaultValue={batchId} className="select">
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="date" className="label">Date</label>
              <input id="date" name="date" type="date" defaultValue={date} max={dhakaToday()} className="input" />
            </div>
            <button className="btn btn-secondary" type="submit">Open</button>
          </form>

          {rosterError ? <p className="mb-4 text-sm text-rose-700">{rosterError}</p> : null}

          {roster && roster.rows.length === 0 ? (
            <EmptyState title="No students in this batch" body="Add students to the batch first." />
          ) : null}

          {roster && roster.rows.length > 0 ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="font-medium text-slate-900">{roster.batch.name}</span>
                <span>·</span>
                <span>{formatDay(dateOnly(date))}</span>
                <span>·</span>
                <Badge tone="good">{counts.PRESENT ?? 0} present</Badge>
                <Badge tone="bad">{counts.ABSENT ?? 0} absent</Badge>
                <Badge tone="warn">{counts.LATE ?? 0} late</Badge>
              </div>

              <form action={saveAttendanceAction}>
                <input type="hidden" name="batchId" value={roster.batch.id} />
                <input type="hidden" name="date" value={date} />
                <Card>
                  <ul className="divide-y divide-slate-100">
                    {roster.rows.map((r) => {
                      const current = r.status ?? "PRESENT";
                      return (
                        <li key={r.studentId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{r.name}</p>
                            <p className="text-xs text-slate-500">{r.username ?? ""}{r.status ? "" : " · not yet marked"}</p>
                          </div>
                          <fieldset className="flex flex-wrap gap-1.5">
                            <legend className="sr-only">Status for {r.name}</legend>
                            {OPTIONS.map((o) => (
                              <label key={o.value} className="cursor-pointer">
                                <input type="radio" name={`s_${r.studentId}`} value={o.value} defaultChecked={current === o.value} className="peer sr-only" />
                                <span className={`inline-block rounded-md border px-3 py-1.5 text-xs font-medium peer-checked:ring-2 peer-checked:ring-teal-600 peer-focus-visible:outline-2 peer-focus-visible:outline-teal-600 ${o.tone}`}>
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
                <div className="sticky bottom-0 mt-4 flex flex-wrap gap-2 bg-slate-50/95 py-3 backdrop-blur">
                  <button className="btn btn-primary" type="submit">Save attendance</button>
                </div>
              </form>

              <form action={markAllPresentAction} className="mt-2">
                <input type="hidden" name="batchId" value={roster.batch.id} />
                <input type="hidden" name="date" value={date} />
                <button className="btn btn-secondary btn-sm" type="submit">Mark everyone present and save</button>
              </form>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
