import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import {
  addAdjustmentAction,
  deleteStudentAction,
  resendActivationAction,
  setStudentArchivedAction,
  updateStudentAction,
} from "@/actions/teacher";
import { getStudentDetail } from "@/services/students";
import { studentLedger } from "@/services/payments";
import { attendanceSummary } from "@/services/attendance";
import { Badge, Card, Field, Flash, PageHeader } from "@/components/ui";
import { ConfirmAction } from "@/components/confirm-action";
import { ClassFields } from "@/components/class-fields";
import { formatDay, formatDateTime } from "@/lib/dates";
import { formatTaka, num } from "@/lib/money";
import { pick } from "@/lib/params";
import { UserError } from "@/lib/errors";

export const metadata = { title: "Student" };

const ATTENDANCE_LABEL: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", LATE: "Late", EXCUSED: "Excused" };

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
  const groupText = s.studentGroup ? ` · ${s.studentGroup}` : "";

  return (
    <>
      <PageHeader
        title={s.user.name}
        description={`${s.className}${groupText} · ${s.version} · ${s.institution}`}
        actions={
          <Badge tone={isArchived ? "neutral" : pending ? "warn" : "good"}>
            {isArchived ? "Archived" : pending ? "Not joined yet" : "Active"}
          </Badge>
        }
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Student and parent" description="One profile. Students and parents see the same information.">
            <form action={updateStudentAction} className="grid gap-5 sm:grid-cols-2">
              <input type="hidden" name="studentId" value={id} />
              <Field label="Student's name" htmlFor="name">
                <input id="name" name="name" required defaultValue={s.user.name} className="input" />
              </Field>
              <Field label="Parent or guardian's phone" htmlFor="guardianPhone" hint="Welcome links and messages go to this number.">
                <input id="guardianPhone" name="guardianPhone" required defaultValue={s.guardian.phoneE164} className="input" />
              </Field>
              <Field label="School or institute" htmlFor="institution">
                <input id="institution" name="institution" required defaultValue={s.institution} className="input" />
              </Field>
              <ClassFields defaultClass={s.className} defaultVersion={s.version} defaultGroup={s.studentGroup ?? ""} />
              <Field label="Monthly fee (৳)" htmlFor="monthlyFee">
                <input id="monthlyFee" name="monthlyFee" type="number" min={0} step="0.01" required defaultValue={num(s.monthlyFee)} className="input" />
              </Field>
              <div className="sm:col-span-2">
                <button className="btn btn-primary" type="submit">Save changes</button>
              </div>
            </form>
          </Card>

          <Card title="Attendance" description={attendance.percentage === null ? "No days recorded yet." : `${attendance.percentage}% of days attended. Excused days aren't counted.`}>
            {attendance.rows.length === 0 ? (
              <p className="text-sm text-slate-500">Attendance you record will show here.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Date</th><th>Batch</th><th>Status</th></tr></thead>
                  <tbody>
                    {attendance.rows.slice(0, 30).map((r, i) => (
                      <tr key={`${r.date.toISOString()}-${i}`}>
                        <td>{formatDay(r.date)}</td>
                        <td>{r.batch.name}</td>
                        <td><Badge tone={r.status === "ABSENT" ? "bad" : r.status === "PRESENT" ? "good" : "neutral"}>{ATTENDANCE_LABEL[r.status]}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Exam results" description="Results shared with the student and parent">
            {results.length === 0 ? (
              <p className="text-sm text-slate-500">No results shared yet.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="tbl">
                  <thead><tr><th>Exam</th><th>Date</th><th className="text-right">Marks</th><th className="text-right">Score</th></tr></thead>
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
              </div>
            )}
          </Card>

          <Card title="Payments" description={`Still to pay: ${formatTaka(balance?.balance ?? 0)}`}>
            <form action={addAdjustmentAction} className="mb-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
              <input type="hidden" name="studentId" value={id} />
              <div>
                <label htmlFor="adjAmount" className="label">Amount (minus to reduce)</label>
                <input id="adjAmount" name="amount" type="number" step="0.01" required className="input" />
              </div>
              <div>
                <label htmlFor="adjReason" className="label">Reason for the change</label>
                <input id="adjReason" name="reason" required maxLength={200} className="input" />
              </div>
              <button className="btn btn-secondary btn-sm" type="submit">Save change</button>
            </form>
            <div className="-mx-5 overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Date</th><th>Entry</th><th className="text-right">Amount</th></tr></thead>
                <tbody>
                  {[
                    ...ledger.payments.map((p) => ({ key: `p${p.id}`, date: p.paidOn, label: `Payment · ${p.method.toLowerCase().replace("_", " ")}${p.forPeriod ? ` · ${p.forPeriod}` : ""}`, amount: -num(p.amount) })),
                    ...ledger.charges.map((c) => ({ key: `c${c.id}`, date: new Date(`${c.period}-01T00:00:00Z`), label: `Monthly fee · ${c.period}`, amount: num(c.amountDue) })),
                    ...ledger.adjustments.map((a) => ({ key: `a${a.id}`, date: a.createdAt, label: `Change · ${a.reason}`, amount: num(a.amount) })),
                  ]
                    .sort((x, y) => y.date.getTime() - x.date.getTime())
                    .slice(0, 40)
                    .map((row) => (
                      <tr key={row.key}>
                        <td className="whitespace-nowrap">{formatDay(row.date)}</td>
                        <td>{row.label}</td>
                        <td className={`text-right tabular-nums ${row.amount < 0 ? "text-emerald-700" : ""}`}>
                          {formatTaka(Math.abs(row.amount))}{row.amount < 0 ? " paid" : ""}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Login">
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-slate-500">Login ID</p>
                <p className="font-mono text-base font-semibold text-slate-900">{s.user.username ?? "—"}</p>
              </div>
              <div>
                <p className="font-medium text-slate-900">Welcome link</p>
                <p className="mb-2 text-slate-600">
                  {pending ? `Sent to ${s.guardian.phoneE164}. Waiting for them to join.` : "Joined. The student and parent sign in with this login."}
                </p>
                {pending ? (
                  <form action={resendActivationAction}>
                    <input type="hidden" name="studentId" value={id} />
                    <button className="btn btn-secondary btn-sm" type="submit">Send a new welcome link</button>
                  </form>
                ) : null}
              </div>
            </div>
          </Card>

          <Card title="Batches">
            {memberships.length === 0 ? (
              <p className="text-sm text-slate-500">Not in a batch yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {memberships.map((m) => (
                  <li key={m.batch.id} className="flex items-center justify-between">
                    <Link href={`/batches/${m.batch.id}`} className="font-medium text-slate-900 hover:underline">{m.batch.name}</Link>
                    {m.leftAt ? <Badge>left {formatDay(m.leftAt)}</Badge> : <Badge tone="good">Current</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent messages">
            {recentSms.length === 0 ? (
              <p className="text-sm text-slate-500">No messages yet.</p>
            ) : (
              <ul className="space-y-2 text-xs text-slate-700">
                {recentSms.map((m, i) => (
                  <li key={i} className="flex items-start justify-between gap-2">
                    <span>
                      {m.smsMessage.purpose.replace(/_/g, " ").toLowerCase()}
                      <br />
                      <span className="text-slate-500">{formatDateTime(m.createdAt)}</span>
                    </span>
                    <Badge tone={m.status === "FAILED" ? "bad" : m.status === "SENT" || m.status === "ACCEPTED" ? "good" : "neutral"}>
                      {m.status === "FAILED" ? "not sent" : m.status === "SENT" || m.status === "ACCEPTED" ? "sent" : m.status.toLowerCase()}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Archive or delete">
            <div className="space-y-4 text-sm">
              {isArchived ? (
                <form action={setStudentArchivedAction}>
                  <input type="hidden" name="studentId" value={id} />
                  <input type="hidden" name="archived" value="0" />
                  <button className="btn btn-secondary btn-sm" type="submit">Restore student</button>
                </form>
              ) : (
                <div>
                  <p className="mb-2 text-slate-600">Archived students leave your active list and cannot sign in. Their records are kept.</p>
                  <ConfirmAction
                    action={setStudentArchivedAction}
                    hidden={{ studentId: id, archived: "1" }}
                    label="Archive student"
                    question={`Archive ${s.user.name}? They leave your active list and cannot sign in. Their records are kept.`}
                    confirmLabel="Yes, archive"
                    tone="primary"
                  />
                </div>
              )}
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-slate-600">Deletes the student only when nothing is recorded for them. Otherwise they are moved to the archive.</p>
                <ConfirmAction
                  action={deleteStudentAction}
                  hidden={{ studentId: id }}
                  label="Delete student"
                  question={`Delete ${s.user.name}? This can't be undone.`}
                  confirmLabel="Yes, delete"
                />
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
