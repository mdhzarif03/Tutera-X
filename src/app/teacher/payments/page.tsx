import { requireRole } from "@/lib/auth/guards";
import { generateChargesAction, recordPaymentAction } from "@/actions/teacher";
import { listFinance } from "@/services/payments";
import { listStudents } from "@/services/students";
import { Badge, Card, EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import { dhakaPeriod, dhakaToday, monthLabel } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { pick } from "@/lib/params";

export const metadata = { title: "Payments" };

const STATE: Record<string, { label: string; tone: "good" | "warn" | "bad" | "neutral" | "info" }> = {
  PAID: { label: "paid", tone: "good" },
  PARTIAL: { label: "partly paid", tone: "info" },
  UNPAID: { label: "unpaid", tone: "warn" },
  OVERDUE: { label: "overdue", tone: "bad" },
  NO_CHARGES: { label: "no charge yet", tone: "neutral" },
};

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const [rows, students] = await Promise.all([listFinance(t.id), listStudents(t.id, { q: "", page: 1, archived: false })]);
  const period = dhakaPeriod();
  const totalOutstanding = rows.reduce((sum, r) => sum + Math.max(0, r.balance?.balance ?? 0), 0);
  const totalCollected = rows.reduce((sum, r) => sum + (r.balance?.paid ?? 0), 0);

  return (
    <>
      <PageHeader title="Payments" description="Monthly tuition, payments and balances. Every change is recorded, and corrections are made as adjustments." />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="card p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Outstanding</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatTaka(totalOutstanding)}</p></div>
        <div className="card p-4"><p className="text-xs uppercase tracking-wide text-slate-500">Collected to date</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatTaka(totalCollected)}</p></div>
        <div className="card col-span-2 p-4 md:col-span-1"><p className="text-xs uppercase tracking-wide text-slate-500">Current month</p><p className="mt-1 text-xl font-semibold">{monthLabel(period)}</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Balances" description="Charges plus adjustments minus payments">
            {rows.length === 0 ? (
              <EmptyState title="No active students" body="Students appear here once they are added and active." />
            ) : (
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="tbl">
                  <thead><tr><th>Student</th><th>Monthly</th><th>Status</th><th className="text-right">Balance</th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const st = r.balance ? STATE[r.balance.state] : undefined;
                      return (
                        <tr key={r.studentId}>
                          <td><a href={`/teacher/students/${r.studentId}`} className="font-medium text-slate-900 hover:underline">{r.name}</a><p className="text-xs text-slate-500">{r.className}</p></td>
                          <td className="tabular-nums">{formatTaka(r.monthlyFee)}</td>
                          <td>{st ? <Badge tone={st.tone}>{st.label}</Badge> : null}</td>
                          <td className={`text-right tabular-nums ${(r.balance?.balance ?? 0) > 0 ? "font-medium text-rose-700" : ""}`}>{formatTaka(r.balance?.balance ?? 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Charge this month" description="Creates one monthly charge per student. Re-running it never double-bills.">
            <form action={generateChargesAction} className="grid gap-3">
              <Field label="Month" htmlFor="period"><input id="period" name="period" type="month" required defaultValue={period} className="input" /></Field>
              <button className="btn btn-secondary" type="submit" disabled={rows.length === 0}>Create monthly charges</button>
            </form>
          </Card>

          <Card title="Record a payment">
            {students.rows.length === 0 ? (
              <p className="text-sm text-slate-600">Add a student to record a payment.</p>
            ) : (
              <form action={recordPaymentAction} className="grid gap-3">
                <Field label="Student" htmlFor="studentId">
                  <select id="studentId" name="studentId" required className="select" defaultValue="">
                    <option value="" disabled>Choose a student</option>
                    {students.rows.map((r) => (
                      <option key={r.student.userId} value={r.student.userId}>{r.student.user.name}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (৳)" htmlFor="amount"><input id="amount" name="amount" type="number" min={1} step="0.01" required className="input" /></Field>
                  <Field label="Method" htmlFor="method">
                    <select id="method" name="method" className="select" defaultValue="CASH">
                      <option value="CASH">Cash</option>
                      <option value="BKASH">bKash</option>
                      <option value="NAGAD">Nagad</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date paid" htmlFor="paidOn"><input id="paidOn" name="paidOn" type="date" defaultValue={dhakaToday()} max={dhakaToday()} className="input" /></Field>
                  <Field label="For month" htmlFor="forPeriod"><input id="forPeriod" name="forPeriod" type="month" defaultValue={period} className="input" /></Field>
                </div>
                <Field label="Reference (optional)" htmlFor="reference"><input id="reference" name="reference" maxLength={80} className="input" placeholder="Receipt or bKash TrxID" /></Field>
                <Field label="Note (optional)" htmlFor="note"><input id="note" name="note" maxLength={200} className="input" /></Field>
                <button className="btn btn-primary" type="submit">Record payment</button>
              </form>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
