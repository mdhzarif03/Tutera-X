import { activateAction } from "@/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Flash } from "@/components/ui";
import { NewPasswordFields } from "@/components/password-form";
import { AccountTokenExchange } from "@/components/account-token-exchange";
import { readAccountTokenCookie } from "@/lib/auth/one-time";
import { pick } from "@/lib/params";

export const metadata = { title: "Activate account" };

export default async function ActivatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const hasToken = Boolean(await readAccountTokenCookie("activation"));
  return (
    <AuthCard title="Set your password" description="Choose a password to activate your account. The link works once.">
      <Flash error={pick(sp, "error")} />
      {hasToken ? (
        <form action={activateAction} className="space-y-4">
          <NewPasswordFields />
          <button type="submit" className="btn btn-primary w-full">Activate and sign in</button>
        </form>
      ) : (
        <AccountTokenExchange kind="activation" />
      )}
    </AuthCard>
  );
}
