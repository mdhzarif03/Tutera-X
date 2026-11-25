import { Fragment } from "react";
import Link from "next/link";
import { Banknote, CalendarPlus, Download, Wallet } from "lucide-react";
import { requireRole } from "@/lib/auth/guards";
import { generateChargesAction, recordPaymentAction } from "@/actions/teacher";
import { listFinance } from "@/services/payments";
import { Badge, Card, EmptyState, Flash, PageHeader, Stat } from "@/components/ui";
import { QuerySelect } from "@/components/query-select";
import { ActiveFilters, FilterPanel } from "@/components/filter-panel";
import { SelectDropdown } from "@/components/select-dropdown";
import { dhakaPeriod, monthLabel } from "@/lib/dates";
import { formatTaka } from "@/lib/money";
import { pick } from "@/lib/params";
import { groupRows, NONE_KEY, parseSort, type GroupKey, type Group } from "@/lib/sort";
import { matchesAll, multi, optionsFrom, selectionQuery, type FilterGroup, type Query } from "@/lib/filters";

export const metadata = { title: "Payments" };

const STATE: Record<string, { label: string; tone: "good" | "warn" | "bad" | "neutral" | "info" }> = {
  PAID: { label: "Paid", tone: "good" },
  PARTIAL: { label: "Part paid", tone: "info" },
  UNPAID: { label: "Unpaid", tone: "warn" },
  OVERDUE: { label: "Past due", tone: "bad" },
  NO_CHARGES: { label: "No fee yet", tone: "neutral" },
};
const STATE_RANK: Record<string, string> = { OVERDUE: "1", UNPAID: "2", PARTIAL: "3", PAID: "4", NO_CHARGES: "5" };

const SORTS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "class", label: "Class" },
  { value: "batch", label: "Batch" },
  { value: "status", label: "Payment status" },
  { value: "owes", label: "Amount owed (highest first)" },
] as const;

type FinanceRow = Awaited<ReturnType<typeof listFinance>>[number];
const owed = (r: FinanceRow) => Math.max(0, r.balance?.balance ?? 0);
const stateOf = (r: FinanceRow) => r.balance?.state ?? "NO_CHARGES";
const batchNamesOf = (r: FinanceRow) => (r.batches.length ? r.batches : [NONE_KEY]);

function keysFor(sort: string, r: FinanceRow): GroupKey[] {
  if (sort === "class") return [{ key: r.className, label: r.className, rank: r.className }];
  if (sort === "batch") {
    return r.batches.length
      ? r.batches.map((b) => ({ key: b, label: b, rank: b }))
      : [{ key: NONE_KEY, label: "No batch", rank: "" }];
  }
  const state = stateOf(r);
  return [{ key: state, label: STATE[state]?.label ?? state, rank: STATE_RANK[state] ?? "9" }];
}

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const sort = parseSort(pick(sp, "sort"), SORTS.map((s) => s.value), "name");
  const all = await listFinance(t.id);
  const period = dhakaPeriod();
  const totalOutstanding = all.reduce((sum, r) => sum + owed(r), 0);
  const totalCollected = all.reduce((sum, r) => sum + (r.balance?.paid ?? 0), 0);

  const groups: FilterGroup[] = [
    {
      name: "batch",
      title: "Batch",
      options: optionsFrom(all.flatMap(batchNamesOf), (v) => (v === NONE_KEY ? "No batch" : v)),
      selected: multi(sp, "batch"),
    },
    { name: "class", title: "Class", options: optionsFrom(all.map((r) => r.className)), selected: multi(sp, "class") },
    { name: "version", title: "Version", options: optionsFrom(all.map((r) => r.version)), selected: multi(sp, "version") },
    {
      name: "status",
      title: "Payment status",
      options: optionsFrom(all.map(stateOf), (v) => STATE[v]?.label ?? v),
      selected: multi(sp, "status"),
    },
  ];
  const [batchG, classG, versionG, statusG] = groups as [FilterGroup, FilterGroup, FilterGroup, FilterGroup];

  const rows = all.filter((r) =>
    matchesAll([
      { selected: batchG.selected, values: batchNamesOf(r) },
      { selected: classG.selected, values: [r.className] },
      { selected: versionG.selected, values: [r.version] },
      { selected: statusG.selected, values: [stateOf(r)] },
    ]),
  );

  let flat: FinanceRow[] = rows;
  let groupsView: Group<FinanceRow>[] | null = null;
  if (sort === "owes") flat = [...rows].sort((a, b) => owed(b) - owed(a) || a.name.localeCompare(b.name));
  else if (sort !== "name") groupsView = groupRows(rows, (r) => keysFor(sort, r));

  const filterQuery: Query = selectionQuery(groups);
  const keep: Query = sort !== "name" ? { sort } : {};
  const noneMatch = all.length > 0 && rows.length === 0;

  const renderRow = (r: FinanceRow) => {
    const st = r.balance ? STATE[r.balance.state] : undefined;
    const amountOwed = owed(r);
    return (
      <tr key={`${sort}-${r.studentId}`}>
        <td>
          <a href={`/teacher/students/${r.studentId}`} className="font-semibold text-slate-900 hover:text-indigo-600">
            {r.name}
          </a>
          <p className="text-xs text-slate-500">
            {r.className}
            {r.version ? ` · ${r.version}` : ""}
            {r.batches.length ? ` · ${r.batches.join(", ")}` : ""}
          </p>
        </td>
        <td className="tabular-nums">{formatTaka(r.monthlyFee)}</td>
        <td>{st ? <Badge tone={st.tone}>{st.label}</Badge> : null}</td>
        <td className={`text-right font-semibold tabular-nums ${amountOwed > 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatTaka(amountOwed)}</td>
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
                  <label htmlFor={`amt-${sort}-${r.studentId}`} className="label">Amount (৳)</label>
                  <input
                    id={`amt-${sort}-${r.studentId}`}
                    name="amount"
                    type="number"
                    min={1}
                    step="0.01"
                    required
                    defaultValue={amountOwed > 0 ? amountOwed : r.monthlyFee}
                    className="input text-base font-semibold"
                  />
                </div>
                <div>
                  <label htmlFor={`met-${sort}-${r.studentId}`} className="label">How was it paid?</label>
                  <SelectDropdown
                    id={`met-${sort}-${r.studentId}`}
                    name="method"
                    defaultValue="CASH"
                    options={[
                      { value: "CASH", label: "Cash" },
                      { value: "BKASH", label: "bKash" },
                      { value: "NAGAD", label: "Nagad" },
                      { value: "BANK_TRANSFER", label: "Bank transfer" },
                      { value: "OTHER", label: "Other" },
                    ]}
                  />
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
  };

  return (
    <>
      <PageHeader title="Payments" description="Record a payment from any student's row. The amount is filled in for you." />
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
            <button className="btn btn-secondary btn-sm w-full" type="submit" disabled={all.length === 0}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Add {monthLabel(period)} fees
            </button>
          </form>
        </Card>
      </div>

      {all.length === 0 ? (
        <EmptyState title="No active students yet" body="Students appear here as soon as they are added and active." />
      ) : (
        <>
          <div className="mb-4 space-y-3">
            <div className="card flex flex-wrap items-center gap-2 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <FilterPanel basePath="/teacher/payments" groups={groups} keep={keep} />
                <QuerySelect paramKey="sort" label="Sort by" value={sort} options={[...SORTS]} defaultValue="name" />
              </div>
              <Link href="/teacher/exports" className="btn btn-secondary ml-auto">
                <Download className="h-4 w-4" aria-hidden="true" />
                Export to Excel
              </Link>
            </div>
            <ActiveFilters basePath="/teacher/payments" groups={groups} keep={keep} shown={rows.length} total={all.length} />
          </div>

          {noneMatch ? (
            <EmptyState title="No students match these filters" body="Remove a filter, or use Clear all to see everyone.">
              <Link className="btn btn-secondary btn-sm" href="/teacher/payments">
                Clear filters
              </Link>
            </EmptyState>
          ) : (
            <Card title="Who owes what" description="Students in several batches appear under each of them.">
              <div className="-mx-5 overflow-x-auto">
                <table className="tbl min-w-[640px]">
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
                    {groupsView
                      ? groupsView.map((g) => {
                          const sum = g.rows.reduce((s, r) => s + owed(r), 0);
                          return (
                            <Fragment key={g.key}>
                              <tr className="bg-slate-50">
                                <td colSpan={5} className="px-4 py-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-sm font-bold text-slate-900">{g.label}</span>
                                    <span className="text-xs text-slate-500">
                                      {g.rows.length} student{g.rows.length === 1 ? "" : "s"} · owes <span className="font-semibold text-slate-700">{formatTaka(sum)}</span>
                                    </span>
                                  </div>
                                </td>
                              </tr>
                              {g.rows.map(renderRow)}
                            </Fragment>
                          );
                        })
                      : flat.map(renderRow)}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
