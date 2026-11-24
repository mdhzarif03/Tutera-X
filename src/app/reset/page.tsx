import { resetAction } from "@/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Flash } from "@/components/ui";
import { NewPasswordFields } from "@/components/password-form";
import { pick } from "@/lib/params";

export const metadata = { title: "New password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <AuthCard title="Verify your code" description="Enter the same login ID, phone or email you used to request the code, then choose a new password.">
      <Flash msg={pick(sp, "msg")} />
      <Flash error={pick(sp, "error")} />
      <form action={resetAction} className="space-y-4">
        <div>
          <label htmlFor="identifier" className="label">Login ID, phone or email</label>
          <input id="identifier" name="identifier" required className="input" />
        </div>
        <div>
          <label htmlFor="code" className="label">SMS verification code</label>
          <input
            id="code"
            name="code"
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            className="input"
          />
          <p className="mt-1.5 text-xs text-slate-500">The code expires in 10 minutes. Five incorrect attempts invalidate it.</p>
        </div>
        <NewPasswordFields />
        <button type="submit" className="btn btn-primary w-full">Verify code and save password</button>
      </form>
    </AuthCard>
  );
}
