import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { createExamAction } from "@/actions/teacher";
import { listBatches } from "@/services/batches";
import { listExams } from "@/services/exams";
import { Badge, Card, EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import { dhakaToday, formatDay } from "@/lib/dates";
import { pick } from "@/lib/params";
import { num } from "@/lib/money";

export const metadata = { title: "Exams" };

const STATUS_TONE = { SCHEDULED: "info", RESULTS_DRAFT: "warn", RESULTS_PUBLISHED: "good", CANCELLED: "neutral" } as const;
const STATUS_LABEL = { SCHEDULED: "coming up", RESULTS_DRAFT: "marking", RESULTS_PUBLISHED: "results shared", CANCELLED: "cancelled" } as const;

export default async function ExamsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const [exams, batches] = await Promise.all([listExams(t.id), listBatches(t.id, false)]);

  return (
    <>
      <PageHeader title="Exams" description="Schedule an exam for one or more batches. Students get a text straight away." />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Schedule an exam" className="lg:col-span-1">
          {batches.length === 0 ? (
            <p className="text-sm text-slate-600">Create a batch first. Exams are for batches.</p>
          ) : (
            <form action={createExamAction} className="grid gap-3">
              <Field label="Exam name" htmlFor="name"><input id="name" name="name" required maxLength={120} className="input" placeholder="Unit test 3" /></Field>
              <Field label="Subject" htmlFor="subject"><input id="subject" name="subject" required maxLength={60} className="input" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" htmlFor="examDate"><input id="examDate" name="examDate" type="date" required min={dhakaToday()} className="input" /></Field>
                <Field label="Time" htmlFor="examTime"><input id="examTime" name="examTime" type="time" required className="input" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total marks" htmlFor="totalMarks"><input id="totalMarks" name="totalMarks" type="number" min={1} max={10000} step="0.5" required className="input" /></Field>
                <Field label="Pass marks" htmlFor="passMarks"><input id="passMarks" name="passMarks" type="number" min={0} step="0.5" className="input" /></Field>
              </div>
              <Field label="Instructions" htmlFor="instructions" hint="Shown to students on their dashboard."><textarea id="instructions" name="instructions" maxLength={500} rows={2} className="textarea" /></Field>
              <fieldset>
                <legend className="label">Batches</legend>
                <div className="space-y-2">
                  {batches.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="batchIds" value={b.id} className="size-4 accent-teal-700" />
                      {b.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <button className="btn btn-primary" type="submit">Schedule exam</button>
            </form>
          )}
        </Card>

        <Card title="All exams" className="lg:col-span-2">
          {exams.length === 0 ? (
            <EmptyState title="No exams yet" body="Exams you add appear here." />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="tbl">
                <thead><tr><th>Exam</th><th>Date</th><th>Batches</th><th className="text-right">Marks</th><th>Status</th></tr></thead>
                <tbody>
                  {exams.map((e) => (
                    <tr key={e.id}>
                      <td><Link href={`/exams/${e.id}`} className="font-medium text-slate-900 hover:underline">{e.name}</Link><p className="text-xs text-slate-500">{e.subject}</p></td>
                      <td className="whitespace-nowrap">{formatDay(e.examDate)} · {e.examTime}</td>
                      <td className="text-slate-600">{e.batches.map((b) => b.batch.name).join(", ")}</td>
                      <td className="text-right tabular-nums">{num(e.totalMarks)}</td>
                      <td><Badge tone={STATUS_TONE[e.status]}>{STATUS_LABEL[e.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
