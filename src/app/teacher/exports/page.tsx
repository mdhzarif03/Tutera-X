import { FileSpreadsheet } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { listBatches } from "@/services/batches";
import { Card, EmptyState, Flash, PageHeader } from "@/components/ui";
import { dhakaToday } from "@/lib/dates";
import { pick } from "@/lib/params";

export const metadata = { title: "Export to Excel" };

export default async function ExportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const batches = await listBatches(t.id, false);
  const today = dhakaToday();
  const firstOfMonth = `${today.slice(0, 8)}01`;

  return (
    <>
      <PageHeader title="Export to Excel" description="Download payments or attendance for one batch, several batches, or all of them, for any date range." />
      <Flash error={pick(sp, "error")} />

      {batches.length === 0 ? (
        <EmptyState title="No batches to export" body="Create a batch and add students to it. Then their records can be exported here." icon={<FileSpreadsheet className="h-6 w-6" aria-hidden="true" />} />
      ) : (
        <form action="/teacher/exports/download" method="get" className="grid max-w-2xl gap-6">
          <Card title="What to export">
            <div className="grid gap-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-4 ring-1 ring-inset ring-slate-200">
                <input type="radio" name="type" value="payments" defaultChecked className="mt-1 h-4 w-4 accent-indigo-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Payments</span>
                  <span className="block text-xs text-slate-500">Every payment received, plus a summary per student with what they owe now.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-2xl p-4 ring-1 ring-inset ring-slate-200">
                <input type="radio" name="type" value="attendance" className="mt-1 h-4 w-4 accent-indigo-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">Attendance</span>
                  <span className="block text-xs text-slate-500">Each day&apos;s register, plus a summary per student.</span>
                </span>
              </label>
            </div>
          </Card>

          <Card title="Batches" description="Choose all batches, or tick the ones you want.">
            <div className="grid gap-3">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-900">
                <input type="radio" name="scope" value="all" defaultChecked className="h-4 w-4 accent-indigo-600" />
                All batches
              </label>
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-900">
                <input type="radio" name="scope" value="selected" className="h-4 w-4 accent-indigo-600" />
                Selected batches only
              </label>
              <ul className="mt-1 grid gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200 sm:grid-cols-2">
                {batches.map((b) => (
                  <li key={b.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm text-slate-800 ring-1 ring-inset ring-slate-200">
                      <input type="checkbox" name="batch" value={b.id} className="h-4 w-4 accent-indigo-600" />
                      <span className="min-w-0 truncate">
                        {b.name} <span className="text-xs text-slate-500">· Class {b.className.replace(/^Class\s*/i, "")}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card title="Date range" description="Both dates are included.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="from" className="label">From</label>
                <input id="from" name="from" type="date" required defaultValue={firstOfMonth} max={today} className="input" />
              </div>
              <div>
                <label htmlFor="to" className="label">To</label>
                <input id="to" name="to" type="date" required defaultValue={today} className="input" />
              </div>
            </div>
          </Card>

          <div className="grid gap-2 sm:flex sm:justify-end">
            <button type="submit" className="btn btn-primary gap-2">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Download Excel file
            </button>
          </div>
        </form>
      )}
    </>
  );
}
