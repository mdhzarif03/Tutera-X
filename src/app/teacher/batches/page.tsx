import Link from "next/link";
import { CalendarClock, MessageCircle, Plus, Search, Users } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { createBatchAction } from "@/actions/teacher";
import { listBatches } from "@/services/batches";
import { Badge, Card, EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import { pick } from "@/lib/params";

export const metadata = { title: "Batches" };

export default async function BatchesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const q = (pick(sp, "q") ?? "").trim().slice(0, 80);
  const [active, archived] = await Promise.all([listBatches(t.id, false, q), listBatches(t.id, true, q)]);

  return (
    <>
      <PageHeader title="Batches" description="Groups of students who learn together." />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <Card
        title="Active batches"
        description={q ? `${active.length} match${active.length === 1 ? "" : "es"} for “${q}”` : `${active.length} batch${active.length === 1 ? "" : "es"}`}
        actions={
          <form method="get" action="/teacher/batches" role="search" className="flex w-full items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                maxLength={80}
                placeholder="Search batches"
                aria-label="Search batches by name, class or subject"
                className="input pl-9"
              />
            </div>
            <button className="btn btn-secondary btn-sm" type="submit">Search</button>
            {q ? <Link className="btn btn-secondary btn-sm" href="/teacher/batches">Clear</Link> : null}
          </form>
        }
      >
        {active.length === 0 ? (
          q ? (
            <EmptyState title="No batches match your search" body="Try a different name, class or subject, or clear the search." />
          ) : (
            <EmptyState title="No batches yet" body="Create a batch, then add students. Attendance and messages can go to a whole batch." />
          )
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((b) => (
              <li key={b.id} className="card card-interactive relative flex flex-col gap-4 p-4">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-slate-900">
                    <Link href={`/teacher/batches/${b.id}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                      {b.name}
                    </Link>
                  </h3>
                  <p className="mt-1 truncate text-xs text-slate-500">{b.subject ?? "No subject set"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{b.className}</Badge>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="tabular-nums">{b._count.members}</span> student{b._count.members === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="tabular-nums">{b._count.schedules}</span> class time{b._count.schedules === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-auto border-t border-slate-100 pt-3">
                  {b.whatsappLink ? (
                    <a
                      href={b.whatsappLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative z-10 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      WhatsApp group added
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                      <MessageCircle className="h-4 w-4" aria-hidden="true" />
                      No WhatsApp group yet
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
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

      <details className="group mt-6">
        <summary className="btn btn-primary inline-flex w-full cursor-pointer list-none items-center justify-center gap-2 sm:w-auto">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="group-open:hidden">New batch</span>
          <span className="hidden group-open:inline">Hide form</span>
        </summary>
        <Card title="New batch" className="mt-4 max-w-xl">
          <form action={createBatchAction} className="grid gap-3">
            <Field label="Batch name" htmlFor="name"><input id="name" name="name" required maxLength={80} className="input" placeholder="Morning A" /></Field>
            <Field label="Class" htmlFor="className"><input id="className" name="className" required maxLength={40} className="input" placeholder="Class 9" /></Field>
            <Field label="Subject (optional)" htmlFor="subject"><input id="subject" name="subject" maxLength={60} className="input" /></Field>
            <Field label="WhatsApp group link (optional)" htmlFor="whatsappLink" hint="Students in this batch will see a button to join the group.">
              <input id="whatsappLink" name="whatsappLink" type="text" inputMode="url" maxLength={200} className="input" placeholder="https://chat.whatsapp.com/…" />
            </Field>
            <button className="btn btn-primary" type="submit">Create batch</button>
          </form>
        </Card>
      </details>
    </>
  );
}
