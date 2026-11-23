import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import {
  addScheduleAction,
  addStudentsToBatchAction,
  removeFromBatchAction,
  removeScheduleAction,
  setBatchArchivedAction,
  updateBatchAction,
} from "@/actions/teacher";
import { getBatch } from "@/services/batches";
import { Badge, Card, EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import { pick } from "@/lib/params";
import { UserError } from "@/lib/errors";

export const metadata = { title: "Batch" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await requireRole("TEACHER");
  const { id } = await params;
  const sp = await searchParams;
  let data;
  try {
    data = await getBatch(t.id, id);
  } catch (err) {
    if (err instanceof UserError) notFound();
    throw err;
  }
  const { batch, options } = data;
  const archived = Boolean(batch.archivedAt);

  return (
    <>
      <PageHeader
        title={batch.name}
        description={`${batch.className}${batch.subject ? ` · ${batch.subject}` : ""} · ${batch.members.length} student${batch.members.length === 1 ? "" : "s"}`}
        actions={
          <>
            <Link className="btn btn-secondary" href={`/teacher/attendance?batch=${batch.id}`}>Take attendance</Link>
            {archived ? <Badge>archived</Badge> : null}
          </>
        }
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Students" description="Removing a student keeps their attendance and results.">
            {batch.members.length === 0 ? (
              <EmptyState title="No students in this batch" body="Add existing students from the list on the right." />
            ) : (
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="tbl">
                  <thead><tr><th>Student</th><th>Guardian</th><th className="text-right"> </th></tr></thead>
                  <tbody>
                    {batch.members.map((m) => (
                      <tr key={m.studentId}>
                        <td><Link href={`/teacher/students/${m.studentId}`} className="font-medium text-slate-900 hover:underline">{m.student.user.name}</Link><p className="text-xs text-slate-500">{m.student.user.username}</p></td>
                        <td>{m.student.guardian.name}</td>
                        <td className="text-right">
                          <form action={removeFromBatchAction}>
                            <input type="hidden" name="batchId" value={batch.id} />
                            <input type="hidden" name="studentId" value={m.studentId} />
                            <button className="btn btn-secondary btn-sm" type="submit">Remove</button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Class times" description="Used for your reference and shown to students.">
            {batch.schedules.length === 0 ? (
              <p className="text-sm text-slate-600">No class times yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {batch.schedules.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2">
                    <span>{DAYS[s.weekday]} · {hhmm(s.startMinute)}–{hhmm(s.endMinute)}{s.room ? ` · ${s.room}` : ""}</span>
                    <form action={removeScheduleAction}>
                      <input type="hidden" name="batchId" value={batch.id} />
                      <input type="hidden" name="scheduleId" value={s.id} />
                      <button className="btn btn-secondary btn-sm" type="submit">Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <form action={addScheduleAction} className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-5">
              <input type="hidden" name="batchId" value={batch.id} />
              <div className="sm:col-span-2">
                <label htmlFor="weekday" className="label">Day</label>
                <select id="weekday" name="weekday" className="select" required>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div><label htmlFor="start" className="label">Start</label><input id="start" name="start" type="time" required className="input" /></div>
              <div><label htmlFor="end" className="label">End</label><input id="end" name="end" type="time" required className="input" /></div>
              <div><label htmlFor="room" className="label">Room</label><input id="room" name="room" maxLength={40} className="input" /></div>
              <div className="sm:col-span-5"><button className="btn btn-secondary btn-sm" type="submit">Add class time</button></div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Add students">
            {options.length === 0 ? (
              <p className="text-sm text-slate-600">Every active student is already in this batch.</p>
            ) : (
              <form action={addStudentsToBatchAction} className="space-y-3">
                <input type="hidden" name="batchId" value={batch.id} />
                <fieldset className="max-h-72 space-y-2 overflow-y-auto">
                  <legend className="sr-only">Students</legend>
                  {options.map((o) => (
                    <label key={o.userId} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="studentIds" value={o.userId} className="size-4 accent-teal-700" />
                      <span>{o.user.name} <span className="text-xs text-slate-500">{o.user.username}</span></span>
                    </label>
                  ))}
                </fieldset>
                <button className="btn btn-primary w-full" type="submit">Add selected</button>
              </form>
            )}
            <p className="mt-4 text-xs text-slate-500">
              To add a new student, <Link href="/teacher/students/new" className="text-teal-700 hover:underline">create them</Link> and choose this batch.
            </p>
          </Card>

          <Card title="Batch details">
            <form action={updateBatchAction} className="grid gap-3">
              <input type="hidden" name="batchId" value={batch.id} />
              <Field label="Name" htmlFor="name"><input id="name" name="name" required maxLength={80} defaultValue={batch.name} className="input" /></Field>
              <Field label="Class" htmlFor="className"><input id="className" name="className" required maxLength={40} defaultValue={batch.className} className="input" /></Field>
              <Field label="Subject" htmlFor="subject"><input id="subject" name="subject" maxLength={60} defaultValue={batch.subject ?? ""} className="input" /></Field>
              <button className="btn btn-secondary" type="submit">Save</button>
            </form>
            <form action={setBatchArchivedAction} className="mt-4 border-t border-slate-100 pt-4">
              <input type="hidden" name="batchId" value={batch.id} />
              <input type="hidden" name="archived" value={archived ? "0" : "1"} />
              <button className="btn btn-danger btn-sm" type="submit">{archived ? "Restore batch" : "Archive batch"}</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
