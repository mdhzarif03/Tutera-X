import { Banknote, CalendarPlus, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { generateChargesAction, recordPaymentAction } from "@/actions/teacher";
import { listFinance } from "@/services/payments";
import { Badge, Card, EmptyState, Flash, PageHeader, Stat } from "@/components/ui";
import { dhakaPeriod, monthLabel } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { pick } from "@/lib/params";

export const metadata = { title: "Payments" };

const STATE: Record<string, { label: string; tone: "good" | "warn" | "bad" | "neutral" | "info" }> = {
  PAID: { label: "Paid", tone: "good" },
  PARTIAL: { label: "Part paid", tone: "info" },
  UNPAID: { label: "Unpaid", tone: "warn" },
  OVERDUE: { label: "Past due", tone: "bad" },
  NO_CHARGES: { label: "No fee yet", tone: "neutral" },
};

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const rows = await listFinance(t.id);
  const period = dhakaPeriod();
  const totalOutstanding = rows.reduce((sum, r) => sum + Math.max(0, r.balance?.balance ?? 0), 0);
  const totalCollected = rows.reduce((sum, r) => sum + (r.balance?.paid ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Payments"
        description="Record a payment from any student's row. The amount is filled in for you."
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="tx-stagger mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Still to collect" tone={totalOutstanding > 0 ? "warn" : "good"} icon={<Wallet className="h-4 w-4" aria-hidden="true" />} value={formatTaka(totalOutstanding)} />
        <Stat label="Collected so far" tone="good" icon={<Banknote className="h-4 w-4" aria-hidden="true" />} value={formatTaka(totalCollected)} />
        <Card className="flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">New month</p>
            <p className="mt-2 text-sm text-slate-600">Add everyone&apos;s fee for {monthLabel(period)} in one step. Safe to press again.</p>
          </div>
          <form action={generateChargesAction} className="mt-4">
            <input type="hidden" name="period" value={period} />
            <button className="btn btn-secondary btn-sm w-full" type="submit" disabled={rows.length === 0}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Add {monthLabel(period)} fees
            </button>
          </form>
        </Card>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No active students yet" body="Students appear here as soon as they are added and active." />
      ) : (
        <Card title="Who owes what" description="Press Record payment to add one.">
          <div className="-mx-5 overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Monthly fee</th>
                  <th>Status</th>
                  <th className="text-right">Owes</th>
                  <th className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const st = r.balance ? STATE[r.balance.state] : undefined;
                  const owes = Math.max(0, r.balance?.balance ?? 0);
                  return (
                    <tr key={r.studentId}>
                      <td>
                        <a href={`/teacher/students/${r.studentId}`} className="font-semibold text-slate-900 hover:text-indigo-600">
                          {r.name}
                        </a>
                        <p className="text-xs text-slate-500">{r.className}</p>
                      </td>
                      <td className="tabular-nums">{formatTaka(r.monthlyFee)}</td>
                      <td>{st ? <Badge tone={st.tone}>{st.label}</Badge> : null}</td>
                      <td className={`text-right font-semibold tabular-nums ${owes > 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatTaka(owes)}</td>
                      <td className="text-right">
                        <details className="group inline-block max-w-full text-left align-top">
                          <summary className="btn btn-primary btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                            <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                            Record payment
                          </summary>
                          <div className="mt-3 w-80 max-w-full rounded-2xl bg-slate-50 p-4 text-left ring-1 ring-inset ring-slate-200">
                            <p className="text-sm font-semibold text-slate-900">Payment from {r.name}</p>
                            <form action={recordPaymentAction} className="mt-3 space-y-3">
                              <input type="hidden" name="studentId" value={r.studentId} />
                              <div>
                                <label htmlFor={`amt-${r.studentId}`} className="label">Amount (৳)</label>
                                <input id={`amt-${r.studentId}`} name="amount" type="number" min={1} step="0.01" required defaultValue={owes > 0 ? owes : r.monthlyFee} className="input text-base font-semibold" />
                              </div>
                              <div>
                                <label htmlFor={`met-${r.studentId}`} className="label">How was it paid?</label>
                                <select id={`met-${r.studentId}`} name="method" defaultValue="CASH" className="select">
                                  <option value="CASH">Cash</option>
                                  <option value="BKASH">bKash</option>
                                  <option value="NAGAD">Nagad</option>
                                  <option value="BANK_TRANSFER">Bank transfer</option>
                                  <option value="OTHER">Other</option>
                                </select>
                              </div>
                              <button type="submit" className="btn btn-primary w-full">
                                Save payment
                              </button>
                              <p className="text-center text-xs text-slate-500">Saved with today&apos;s date.</p>
                            </form>
                          </div>
                        </details>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
