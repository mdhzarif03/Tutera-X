import { resetAction } from "@/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Flash } from "@/components/ui";
import { NewPasswordFields } from "@/components/password-form";
import { AccountTokenExchange } from "@/components/account-token-exchange";
import { readAccountTokenCookie } from "@/lib/auth/one-time";
import { pick } from "@/lib/params";

export const metadata = { title: "New password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const hasToken = Boolean(await readAccountTokenCookie("reset"));
  return (
    <AuthCard title="Choose a new password" description="This link works only once and expires in one hour.">
      <Flash error={pick(sp, "error")} />
      {hasToken ? (
        <form action={resetAction} className="space-y-4">
          <NewPasswordFields />
          <button type="submit" className="btn btn-primary w-full">Save password</button>
        </form>
      ) : (
        <AccountTokenExchange kind="reset" />
      )}
    </AuthCard>
  );
}
