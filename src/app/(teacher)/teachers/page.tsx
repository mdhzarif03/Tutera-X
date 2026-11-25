import { headers } from "next/headers";
import { requireRole } from "@/lib/auth/guards";
import {
  inviteTeacherAction,
  revokeInvitationAction,
  sendTeacherResetCodeAction,
  setTeacherActiveAction,
} from "@/actions/teacher";
import { listInvitations, listTeachers } from "@/services/teachers";
import { Badge, Card, EmptyState, Field, Flash, PageHeader } from "@/components/ui";
import { ConfirmAction } from "@/components/confirm-action";
import { formatDateTime } from "@/lib/dates";
import { pick } from "@/lib/params";
import { logUnexpectedError, requestIdFromHeaders } from "@/lib/errors";

export const metadata = { title: "Team" };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const t = await requireRole("TEACHER");
  const sp = await searchParams;
  const viewerIsOwner = t.teacherRole === "OWNER";
  const requestId = requestIdFromHeaders(await headers());
  let teachers: Awaited<ReturnType<typeof listTeachers>>;
  let invitations: Awaited<ReturnType<typeof listInvitations>>;
  try {
    [teachers, invitations] = await Promise.all([listTeachers(), listInvitations(t.id)]);
  } catch (err) {
    logUnexpectedError("[page] teacher team data failed", {
      operation: "teacher.team.read",
      model: "User, TeacherInvitation",
      requestId,
    }, err);
    throw err;
  }

  return (
    <>
      <PageHeader
        title="Team"
        description={viewerIsOwner
          ? "Invite a colleague by phone. They receive a secure SMS link that expires after three days."
          : "View the teachers on your team."}
      />
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          {viewerIsOwner ? (
            <>
              <Card title="Invite a teacher">
                <form action={inviteTeacherAction} className="grid gap-3">
                  <Field label="Phone number" htmlFor="phone" hint="A secure setup link will be sent by SMS.">
                    <input id="phone" name="phone" type="tel" required inputMode="tel" autoComplete="tel" maxLength={20} placeholder="01712345678" className="input" />
                  </Field>
                  <button className="btn btn-primary" type="submit">Send invitation SMS</button>
                </form>
              </Card>

              <Card title="Pending invitations">
                {invitations.length === 0 ? (
                  <EmptyState title="None pending" body="Invitations you send appear here until they're used or expire." />
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {invitations.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{i.phoneE164 ?? "No phone number"}</p>
                          <p className="text-xs text-slate-500">Expires {formatDateTime(i.expiresAt)}</p>
                        </div>
                        <form action={revokeInvitationAction}>
                          <input type="hidden" name="invitationId" value={i.id} />
                          <button className="btn btn-secondary btn-sm" type="submit">Cancel</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          ) : (
            <Card title="Team invitations">
              <p className="text-sm text-slate-600">Only the owner can invite teachers or manage invitations.</p>
            </Card>
          )}
        </div>

        <Card title="Team" className="lg:col-span-2" description="Everyone who can sign in to Tutera-X.">
          {teachers.length === 0 ? (
            <EmptyState title="No team members found" body={viewerIsOwner ? "Invite a teacher to build your team." : "Ask the owner to invite teachers."} />
          ) : (
            <>
              {teachers.length === 1 && teachers[0]?.id === t.id ? (
                <p className="mb-2 text-sm text-slate-500">You&apos;re currently the only teacher on the team.</p>
              ) : null}
              <ul className="divide-y divide-slate-100">
                {teachers.map((tc) => {
                  const targetIsOwner = tc.teacherProfile?.role === "OWNER";
                  const isSelf = tc.id === t.id;
                  return (
                    <li key={tc.id} className="py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">
                            {tc.name}
                            {isSelf ? <span className="ml-1 text-xs font-normal text-slate-500">(you)</span> : null}
                          </p>
                          <p className="text-xs text-slate-500">{tc.phoneE164 ?? "No contact number"}</p>
                          {tc.teacherProfile?.subjects ? <p className="mt-1 text-xs text-slate-600">Subjects: {tc.teacherProfile.subjects}</p> : null}
                          {tc.teacherProfile?.institutionName ? <p className="text-xs text-slate-500">{tc.teacherProfile.institutionName}</p> : null}
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {targetIsOwner ? <Badge tone="info">owner</Badge> : <Badge>teacher</Badge>}
                            <Badge tone={tc.status === "ACTIVE" ? "good" : "neutral"}>{tc.status === "ACTIVE" ? "active" : "access off"}</Badge>
                          </div>
                        </div>
                      </div>

                      {viewerIsOwner && !isSelf ? (
                        <div className="mt-3 flex flex-wrap items-start gap-2">
                          {tc.phoneE164 && tc.status === "ACTIVE" ? (
                            <form action={sendTeacherResetCodeAction}>
                              <input type="hidden" name="teacherId" value={tc.id} />
                              <button className="btn btn-secondary btn-sm" type="submit">Send reset code by SMS</button>
                            </form>
                          ) : null}
                          {!targetIsOwner && tc.status === "ACTIVE" ? (
                            <ConfirmAction
                              action={setTeacherActiveAction}
                              hidden={{ teacherId: tc.id, active: "0" }}
                              label="Turn access off"
                              question={`Turn off ${tc.name}'s access? They are signed out and cannot sign in until you turn it back on.`}
                              confirmLabel="Yes, turn off"
                            />
                          ) : null}
                          {!targetIsOwner && tc.status !== "ACTIVE" ? (
                            <form action={setTeacherActiveAction}>
                              <input type="hidden" name="teacherId" value={tc.id} />
                              <input type="hidden" name="active" value="1" />
                              <button className="btn btn-secondary btn-sm" type="submit">Turn access on</button>
                            </form>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {!viewerIsOwner ? (
            <p className="mt-4 text-xs text-slate-500">Only the owner can send a teacher reset code or turn a teacher&apos;s access on or off.</p>
          ) : null}
        </Card>
      </div>
    </>
  );
}
