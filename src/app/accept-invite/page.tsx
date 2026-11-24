import { acceptInviteAction } from "@/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Flash } from "@/components/ui";
import { NewPasswordFields } from "@/components/password-form";
import { InviteExchange } from "@/components/invite-exchange";
import { readInviteCookie } from "@/lib/auth/one-time";
import { pick } from "@/lib/params";

export const metadata = { title: "Join Tutera-X" };

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const hasInvite = Boolean(await readInviteCookie());

  return (
    <AuthCard title="Join your team" description="Complete your teacher profile and choose a password to join.">
      <Flash error={pick(sp, "error")} />
      {hasInvite ? (
        <form action={acceptInviteAction} className="space-y-4">
          <div>
            <label htmlFor="name" className="label">Full name</label>
            <input id="name" name="name" required maxLength={120} autoComplete="name" className="input" />
          </div>
          <div>
            <label htmlFor="subjects" className="label">Subjects you teach (optional)</label>
            <input id="subjects" name="subjects" maxLength={200} className="input" />
            <p className="mt-1.5 text-xs text-slate-500">Separate multiple subjects with commas.</p>
          </div>
          <div>
            <label htmlFor="institutionName" className="label">School or institute (optional)</label>
            <input id="institutionName" name="institutionName" maxLength={120} className="input" />
          </div>
          <NewPasswordFields />
          <button type="submit" className="btn btn-primary w-full">Join</button>
        </form>
      ) : (
        <InviteExchange />
      )}
    </AuthCard>
  );
}
