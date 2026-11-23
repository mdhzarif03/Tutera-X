import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { createBatchAction } from "@/actions/teacher";
import { listBatches } from "@/services/batches";
import { Badge, Card, EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import { pick } from "@/lib/params";

export const metadata = { title: "Batches" };

export default async function BatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const active = await listBatches(t.id, false);
  const archived = await listBatches(t.id, true);

  return (
    <>
      <PageHeader title="Batches" description="Groups of students who learn together." />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="New batch" className="lg:col-span-1">
          <form action={createBatchAction} className="grid gap-3">
            <Field label="Batch name" htmlFor="name"><input id="name" name="name" required maxLength={80} className="input" placeholder="Morning A" /></Field>
            <Field label="Class" htmlFor="className"><input id="className" name="className" required maxLength={40} className="input" placeholder="Class 9" /></Field>
            <Field label="Subject (optional)" htmlFor="subject"><input id="subject" name="subject" maxLength={60} className="input" /></Field>
            <button className="btn btn-primary" type="submit">Create batch</button>
          </form>
        </Card>

        <Card title="Active batches" className="lg:col-span-2" description={`${active.length} batch${active.length === 1 ? "" : "es"}`}>
          {active.length === 0 ? (
            <EmptyState title="No batches yet" body="Create a batch, then add students. Attendance and messages can go to a whole batch." />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="tbl">
                <thead><tr><th>Batch</th><th>Class</th><th>Students</th><th>Class times</th></tr></thead>
                <tbody>
                  {active.map((b) => (
                    <tr key={b.id}>
                      <td><Link href={`/teacher/batches/${b.id}`} className="font-medium text-slate-900 hover:underline">{b.name}</Link>{b.subject ? <p className="text-xs text-slate-500">{b.subject}</p> : null}</td>
                      <td>{b.className}</td>
                      <td className="tabular-nums">{b._count.members}</td>
                      <td className="tabular-nums">{b._count.schedules}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {archived.length > 0 ? (
            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Archived</p>
              <ul className="flex flex-wrap gap-2">
                {archived.map((b) => (
                  <li key={b.id}><Link href={`/teacher/batches/${b.id}`}><Badge>{b.name}</Badge></Link></li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}
