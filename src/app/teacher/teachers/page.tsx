import { requireRole } from "@/lib/auth/guards";
import {
  adjustAllowanceAction,
  dismissInviteLinkAction,
  inviteTeacherAction,
  revokeInvitationAction,
  setTeacherActiveAction,
} from "@/actions/teacher";
import { inviteUrl, listInvitations, listTeachers } from "@/services/teachers";
import { readInviteRevealCookie } from "@/lib/auth/one-time";
import { remainingCredits } from "@/lib/sms/allowance-math";
import { Badge, Card, EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { pick } from "@/lib/params";

export const metadata = { title: "Teachers" };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const viewerIsOwner = t.teacherRole === "OWNER";
  const [teachers, invitations, revealToken] = await Promise.all([listTeachers(), listInvitations(), readInviteRevealCookie()]);

  return (
    <>
      <PageHeader title="Teachers" description="Invite teachers by link, and manage their SMS allowances. There is no public sign-up." />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      {revealToken ? (
        <Card title="Share this invitation link" className="mb-6 border-teal-300">
          <p className="mb-3 text-sm text-slate-600">
            Send this link privately. It works once and expires in 72 hours. It is shown only until you dismiss it.
          </p>
          <code className="block break-all rounded-md bg-slate-900 px-3 py-2 text-xs text-slate-100">{inviteUrl(revealToken)}</code>
          <form action={dismissInviteLinkAction} className="mt-3">
            <button className="btn btn-secondary btn-sm" type="submit">I have copied it, hide the link</button>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card title="Invite a teacher">
            <form action={inviteTeacherAction} className="grid gap-3">
              <Field label="Email address" htmlFor="email"><input id="email" name="email" type="email" required maxLength={254} className="input" /></Field>
              <button className="btn btn-primary" type="submit">Create invitation</button>
            </form>
          </Card>

          <Card title="Pending invitations">
            {invitations.length === 0 ? (
              <EmptyState title="None pending" body="Invitations you create appear here until they are used, revoked, or expire." />
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {invitations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{i.email}</p>
                      <p className="text-xs text-slate-500">Expires {formatDateTime(i.expiresAt)}</p>
                    </div>
                    {i.invitedById === t.id ? (
                      <form action={revokeInvitationAction}>
                        <input type="hidden" name="invitationId" value={i.id} />
                        <button className="btn btn-secondary btn-sm" type="submit">Revoke</button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Teachers and SMS allowances" className="lg:col-span-2" description="Allowances are in SMS credits (one per segment). The shared provider balance is separate.">
          <ul className="divide-y divide-slate-100">
            {teachers.map((tc) => {
              const profile = tc.teacherProfile;
              const targetIsOwner = profile?.role === "OWNER";
              const isSelf = tc.id === t.id;
              const state = profile
                ? { allowance: profile.smsAllowance, used: profile.smsCreditsUsed, reserved: profile.smsCreditsReserved }
                : null;
              return (
                <li key={tc.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">
                        {tc.name}
                        {isSelf ? <span className="ml-1 text-xs font-normal text-slate-500">(you)</span> : null}
                      </p>
                      <p className="text-xs text-slate-500">{tc.email}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {targetIsOwner ? <Badge tone="info">owner</Badge> : <Badge>teacher</Badge>}
                        <Badge tone={tc.status === "ACTIVE" ? "good" : "neutral"}>{tc.status === "ACTIVE" ? "active" : "disabled"}</Badge>
                      </div>
                    </div>
                    {state ? (
                      <div className="text-right text-sm">
                        <p className="font-semibold tabular-nums text-slate-900">{remainingCredits(state).toLocaleString("en-US")} left</p>
                        <p className="text-xs text-slate-500">
                          {state.allowance.toLocaleString("en-US")} allowed · {state.used.toLocaleString("en-US")} used · {state.reserved.toLocaleString("en-US")} queued
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {viewerIsOwner ? (
                    <form action={adjustAllowanceAction} className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="teacherId" value={tc.id} />
                      <div>
                        <label htmlFor={`delta-${tc.id}`} className="label">Change (credits)</label>
                        <input id={`delta-${tc.id}`} name="delta" type="number" step={1} required placeholder="+500 or -100" className="input w-40" />
                      </div>
                      <div className="min-w-48 flex-1">
                        <label htmlFor={`note-${tc.id}`} className="label">Note (optional)</label>
                        <input id={`note-${tc.id}`} name="note" maxLength={200} className="input" />
                      </div>
                      <button className="btn btn-secondary btn-sm" type="submit">Update allowance</button>
                    </form>
                  ) : null}

                  {viewerIsOwner && !targetIsOwner && !isSelf ? (
                    <form action={setTeacherActiveAction} className="mt-3">
                      <input type="hidden" name="teacherId" value={tc.id} />
                      <input type="hidden" name="active" value={tc.status === "ACTIVE" ? "0" : "1"} />
                      <button className="btn btn-secondary btn-sm" type="submit">{tc.status === "ACTIVE" ? "Deactivate and sign out" : "Reactivate"}</button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {!viewerIsOwner ? <p className="mt-4 text-xs text-slate-500">Only the owner can change allowances or deactivate teachers.</p> : null}
        </Card>
      </div>
    </>
  );
}
