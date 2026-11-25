import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { publishResultsAction, saveMarksAction } from "@/actions/teacher";
import { getExamSheet } from "@/services/exams";
import { Badge, Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { ConfirmAction } from "@/components/confirm-action";
import { formatDay } from "@/lib/dates";
import { pick } from "@/lib/params";
import { UserError } from "@/lib/errors";
import { num } from "@/lib/money";

export const metadata = { title: "Exam results" };

export default async function ExamSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await requireRole("TEACHER");
  const { id } = await params;
  const sp = await searchParams;
  let sheet;
  try {
    sheet = await getExamSheet(t.id, id);
  } catch (err) {
    if (err instanceof UserError) notFound();
    throw err;
  }
  const { exam, rows, missing } = sheet;
  const total = num(exam.totalMarks);
  const publishable = rows.length > 0 && missing === 0;
  const published = exam.status === "RESULTS_PUBLISHED";

  return (
    <>
      <PageHeader
        title={exam.name}
        description={`${exam.subject} · ${formatDay(exam.examDate)} at ${exam.examTime} · ${total} marks${exam.passMarks ? ` · pass ${num(exam.passMarks)}` : ""}`}
        actions={<Badge tone={published ? "good" : "info"}>{published ? "results published" : exam.status === "RESULTS_DRAFT" ? "marking" : "scheduled"}</Badge>}
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <p className="mb-4 text-sm text-slate-600">
        Batches: {exam.batches.map((b) => b.batch.name).join(", ")}. Enter each student's marks, or tick Absent. Students see results only after you share them.
        {missing > 0 ? <span className="font-medium text-amber-800"> {missing} student{missing === 1 ? "" : "s"} still need marks or an absence tick.</span> : null}
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No students in this exam yet" body="No students are in this exam's batches yet." />
      ) : (
        <>
          <form action={saveMarksAction}>
            <input type="hidden" name="examId" value={exam.id} />
            <Card>
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="tbl">
                  <thead><tr><th>Student</th><th className="w-40">Marks (out of {total})</th><th className="w-24 text-center">Absent</th><th>State</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.studentId}>
                        <td><span className="font-medium text-slate-900">{r.name}</span><p className="text-xs text-slate-500">{r.username}</p></td>
                        <td>
                          <label htmlFor={`m_${r.studentId}`} className="sr-only">Marks for {r.name}</label>
                          <input
                            id={`m_${r.studentId}`}
                            name={`m_${r.studentId}`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={total}
                            step="0.5"
                            defaultValue={r.marks ?? ""}
                            disabled={published}
                            className="input tabular-nums"
                          />
                        </td>
                        <td className="text-center">
                          <label className="inline-flex items-center gap-2">
                            <input type="checkbox" name="absent" value={r.studentId} defaultChecked={r.absent} disabled={published} className="size-4 accent-rose-600" />
                            <span className="sr-only">Absent</span>
                          </label>
                        </td>
                        <td>{r.published ? <Badge tone="good">shared</Badge> : r.marks !== null || r.absent ? <Badge tone="info">entered</Badge> : <Badge tone="warn">to enter</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <div className="mt-4 flex flex-wrap gap-2">
              {!published ? <button className="btn btn-secondary" type="submit">Save marks</button> : <p className="text-sm text-slate-600">Results are shared. Changes are logged.</p>}
            </div>
          </form>

          {!published ? (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-teal-200 bg-teal-50/60 p-4">
                <div className="flex-1 text-sm text-teal-950">
                  <p className="font-semibold">Share results</p>
                  <p className="text-teal-900/80">Students can see their marks. Each parent gets one text. Shared results can&apos;t be taken back.</p>
                </div>
                {publishable ? (
                  <ConfirmAction
                    action={publishResultsAction}
                    hidden={{ examId: exam.id }}
                    label={`Share ${rows.length} result${rows.length === 1 ? "" : "s"}`}
                    question={`Share ${rows.length} result${rows.length === 1 ? "" : "s"} now? Each parent gets one text. You cannot take shared results back.`}
                    confirmLabel="Yes, share now"
                    tone="primary"
                  />
                ) : (
                  <p className="text-sm text-amber-800">Enter every student&apos;s marks before sharing.</p>
                )}
              </div>
          ) : null}
        </>
      )}
    </>
  );
}
