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
    <AuthCard title="Join as a teacher" description="You have been invited to Tutera-X. Enter your name and choose a password.">
      <Flash error={pick(sp, "error")} />
      {hasInvite ? (
        <form action={acceptInviteAction} className="space-y-4">
          <div>
            <label htmlFor="name" className="label">Full name</label>
            <input id="name" name="name" required maxLength={120} autoComplete="name" className="input" />
          </div>
          <NewPasswordFields />
          <button type="submit" className="btn btn-primary w-full">Create account</button>
        </form>
      ) : (
        <InviteExchange />
      )}
    </AuthCard>
  );
}
