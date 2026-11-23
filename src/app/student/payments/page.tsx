import { requireRole } from "@/lib/auth/guards";
import { studentDashboard } from "@/services/dashboards";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { formatTaka, num } from "@/lib/money";

export const metadata = { title: "Payments" };

export default async function StudentPayments() {
  const user = await requireRole("STUDENT");
  const data = await studentDashboard(user.id);
  const b = data.balance;
  return (
    <>
      <PageHeader title="Payments" description="Your tuition, payments and balance. Contact your teacher about any question." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Monthly tuition" value={formatTaka(num(data.profile.monthlyFee))} />
        <Stat label="Total charged" value={formatTaka(b?.charged ?? 0)} />
        <Stat label="Paid" value={formatTaka(b?.paid ?? 0)} />
        <Stat label="Balance due" value={formatTaka(Math.max(0, b?.balance ?? 0))} hint={b?.state === "OVERDUE" ? "Overdue" : undefined} />
      </div>
      <div className="mt-6">
        <Card title="Payment history">
          {data.payments.length === 0 ? (
            <EmptyState title="No payments yet" body="Payments your teacher records appear here." />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="tbl">
                <thead><tr><th>Date</th><th>For month</th><th>Method</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap">{formatDay(p.paidOn)}</td>
                      <td>{p.forPeriod ?? "—"}</td>
                      <td><Badge>{p.method.toLowerCase().replace("_", " ")}</Badge></td>
                      <td className="text-right tabular-nums">{formatTaka(num(p.amount))}</td>
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
