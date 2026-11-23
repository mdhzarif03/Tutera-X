import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import {
  addAdjustmentAction,
  createParentLoginAction,
  resendActivationAction,
  setStudentArchivedAction,
  updateStudentAction,
} from "@/actions/teacher";
import { getStudentDetail } from "@/services/students";
import { studentLedger } from "@/services/payments";
import { attendanceSummary } from "@/services/attendance";
import { Badge, Card, Field, Flash, PageHeader } from "@/components/ui";
import { formatDay, formatDateTime } from "@/lib/dates";
import { formatTaka, num } from "@/lib/money";
import { pick } from "@/lib/params";
import { UserError } from "@/lib/errors";

export const metadata = { title: "Student" };

const STATUS_LABEL: Record<string, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  EXCUSED: "Excused",
};

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await requireRole("TEACHER");
  const { id } = await params;
  const sp = await searchParams;

  let detail;
  try {
    detail = await getStudentDetail(t.id, id);
  } catch (err) {
    if (err instanceof UserError) notFound();
    throw err;
  }
  const { student, memberships, results, recentSms, balance } = detail;
  const [attendance, ledger] = await Promise.all([attendanceSummary(id, { teacherId: t.id }), studentLedger(id)]);
  const s = student;
  const isArchived = Boolean(s.archivedAt);
  const pending = s.user.status === "PENDING_ACTIVATION";
  const hasParentLogin = Boolean(s.guardian.parentUser);

  return (
    <>
      <PageHeader
        title={s.user.name}
        description={`${s.className} · ${s.institution} · ${s.version} · username ${s.user.username ?? "—"}`}
        actions={
          <>
            <Badge tone={isArchived ? "neutral" : s.user.status === "ACTIVE" ? "good" : "warn"}>
              {isArchived ? "archived" : pending ? "awaiting activation" : s.user.status.toLowerCase()}
            </Badge>
          </>
        }
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile" description="Changes apply to future messages. Past messages are not edited.">
            <form action={updateStudentAction} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="studentId" value={id} />
              <Field label="Student name" htmlFor="name"><input id="name" name="name" required defaultValue={s.user.name} className="input" /></Field>
              <Field label="Student phone (optional)" htmlFor="phone"><input id="phone" name="phone" defaultValue={s.user.phoneE164 ?? ""} className="input" /></Field>
              <Field label="Guardian name" htmlFor="guardianName"><input id="guardianName" name="guardianName" required defaultValue={s.guardian.name} className="input" /></Field>
              <Field label="Guardian phone" htmlFor="guardianPhone"><input id="guardianPhone" name="guardianPhone" required defaultValue={s.guardian.phoneE164} className="input" /></Field>
              <Field label="Class" htmlFor="className"><input id="className" name="className" required defaultValue={s.className} className="input" /></Field>
              <Field label="Institution" htmlFor="institution"><input id="institution" name="institution" required defaultValue={s.institution} className="input" /></Field>
              <Field label="Version / medium" htmlFor="version"><input id="version" name="version" required defaultValue={s.version} className="input" /></Field>
              <Field label="Monthly tuition (৳)" htmlFor="monthlyFee"><input id="monthlyFee" name="monthlyFee" type="number" min={0} step="0.01" required defaultValue={num(s.monthlyFee)} className="input" /></Field>
              <div className="sm:col-span-2"><button className="btn btn-primary" type="submit">Save changes</button></div>
            </form>
          </Card>

          <Card title="Attendance" description={attendance.percentage === null ? "No attendance recorded yet." : `${attendance.percentage}% attended (present or late; excused days excluded)`}>
            {attendance.rows.length === 0 ? (
              <p className="text-sm text-slate-600">Attendance you record appears here.</p>
            ) : (
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="tbl">
                  <thead><tr><th>Date</th><th>Batch</th><th>Status</th></tr></thead>
                  <tbody>
                    {attendance.rows.slice(0, 30).map((r, i) => (
                      <tr key={`${r.date.toISOString()}-${i}`}>
                        <td>{formatDay(r.date)}</td>
                        <td>{r.batch.name}</td>
                        <td><Badge tone={r.status === "ABSENT" ? "bad" : r.status === "PRESENT" ? "good" : "neutral"}>{STATUS_LABEL[r.status]}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Exam results" description="Published results only">
            {results.length === 0 ? (
              <p className="text-sm text-slate-600">No published results yet.</p>
            ) : (
              <table className="tbl">
                <thead><tr><th>Exam</th><th>Date</th><th className="text-right">Marks</th><th className="text-right">%</th></tr></thead>
                <tbody>
                  {results.map((r) => {
                    const total = num(r.totalMarksSnapshot);
                    const obtained = r.isAbsent ? 0 : num(r.obtainedMarks);
                    return (
                      <tr key={r.exam.id}>
                        <td>{r.exam.name} <span className="text-xs text-slate-500">{r.exam.subject}</span></td>
                        <td>{formatDay(r.exam.examDate)}</td>
                        <td className="text-right tabular-nums">{r.isAbsent ? "Absent" : `${obtained} / ${total}`}</td>
                        <td className="text-right tabular-nums">{total ? `${Math.round((obtained / total) * 100)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Fees and payments" description={balance ? `Balance: ${formatTaka(balance.balance)}` : undefined}>
            <div className="mb-5 grid gap-4 md:grid-cols-2">
              <form action={addAdjustmentAction} className="grid gap-3 rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-900">Add an adjustment</p>
                <input type="hidden" name="studentId" value={id} />
                <input name="amount" type="number" step="0.01" required placeholder="Amount (negative to reduce)" className="input" aria-label="Adjustment amount" />
                <input name="reason" required maxLength={200} placeholder="Reason" className="input" aria-label="Adjustment reason" />
                <button className="btn btn-secondary btn-sm justify-self-start" type="submit">Record adjustment</button>
              </form>
              <div className="rounded-lg bg-slate-50 p-4 text-sm">
                <p className="font-medium text-slate-900">Ledger summary</p>
                <dl className="mt-2 grid grid-cols-2 gap-y-1 text-slate-600">
                  <dt>Charged</dt><dd className="text-right tabular-nums">{formatTaka(balance?.charged ?? 0)}</dd>
                  <dt>Paid</dt><dd className="text-right tabular-nums">{formatTaka(balance?.paid ?? 0)}</dd>
                  <dt>Adjusted</dt><dd className="text-right tabular-nums">{formatTaka(balance?.adjusted ?? 0)}</dd>
                  <dt className="font-medium text-slate-900">Balance</dt><dd className="text-right font-medium tabular-nums text-slate-900">{formatTaka(balance?.balance ?? 0)}</dd>
                </dl>
              </div>
            </div>
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Entry</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {[
                    ...ledger.payments.map((p) => ({ key: `p${p.id}`, date: p.paidOn, label: `Payment · ${p.method.toLowerCase().replace("_", " ")}${p.forPeriod ? ` · ${p.forPeriod}` : ""}`, amount: -num(p.amount) })),
                    ...ledger.charges.map((c) => ({ key: `c${c.id}`, date: new Date(`${c.period}-01T00:00:00Z`), label: `Monthly fee · ${c.period}`, amount: num(c.amountDue) })),
                    ...ledger.adjustments.map((a) => ({ key: `a${a.id}`, date: a.createdAt, label: `Adjustment · ${a.reason}`, amount: num(a.amount) })),
                  ]
                    .sort((x, y) => y.date.getTime() - x.date.getTime())
                    .slice(0, 40)
                    .map((row) => (
                      <tr key={row.key}>
                        <td className="whitespace-nowrap">{formatDay(row.date)}</td>
                        <td>{row.label}</td>
                        <td className={`text-right tabular-nums ${row.amount < 0 ? "text-emerald-700" : ""}`}>{formatTaka(Math.abs(row.amount))}{row.amount < 0 ? " paid" : ""}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Access">
            <div className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-slate-900">Student login</p>
                <p className="text-slate-600">{pending ? "Activation link sent. The student has not set a password yet." : "Active."}</p>
                {pending ? (
                  <form action={resendActivationAction} className="mt-2">
                    <input type="hidden" name="studentId" value={id} />
                    <button className="btn btn-secondary btn-sm" type="submit">Send a new activation link</button>
                  </form>
                ) : null}
              </div>
              <div>
                <p className="font-medium text-slate-900">Parent login</p>
                {hasParentLogin ? (
                  <p className="text-slate-600">Created for {s.guardian.name} (username {s.guardian.parentUser?.user.username ?? "—"}).</p>
                ) : (
                  <form action={createParentLoginAction} className="mt-2">
                    <input type="hidden" name="studentId" value={id} />
                    <p className="mb-2 text-slate-600">The guardian can view attendance, results and fees. Activation is sent to {s.guardian.phoneE164}.</p>
                    <button className="btn btn-secondary btn-sm" type="submit">Create parent login</button>
                  </form>
                )}
              </div>
              <div>
                <p className="font-medium text-slate-900">Archive</p>
                <p className="mb-2 text-slate-600">Archived students cannot sign in. Their history is kept.</p>
                <form action={setStudentArchivedAction}>
                  <input type="hidden" name="studentId" value={id} />
                  <input type="hidden" name="archived" value={isArchived ? "0" : "1"} />
                  <button className="btn btn-danger btn-sm" type="submit">{isArchived ? "Restore student" : "Archive student"}</button>
                </form>
              </div>
            </div>
          </Card>

          <Card title="Batches">
            {memberships.length === 0 ? (
              <p className="text-sm text-slate-600">Not in any batch yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {memberships.map((m) => (
                  <li key={m.batch.id} className="flex items-center justify-between">
                    <Link href={`/teacher/batches/${m.batch.id}`} className="font-medium text-slate-900 hover:underline">{m.batch.name}</Link>
                    {m.leftAt ? <Badge>left {formatDay(m.leftAt)}</Badge> : <Badge tone="good">current</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent SMS">
            {recentSms.length === 0 ? (
              <p className="text-sm text-slate-600">No messages yet.</p>
            ) : (
              <ul className="space-y-2 text-xs text-slate-700">
                {recentSms.map((m, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span>{m.smsMessage.purpose.replace(/_/g, " ").toLowerCase()}<br /><span className="text-slate-500">{formatDateTime(m.createdAt)}</span></span>
                    <Badge tone={m.status === "FAILED" ? "bad" : m.status === "SENT" || m.status === "ACCEPTED" ? "good" : "neutral"}>{m.status.toLowerCase()}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
