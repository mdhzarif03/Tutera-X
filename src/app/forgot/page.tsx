import Link from "next/link";
import { forgotAction } from "@/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Flash } from "@/components/ui";
import { pick } from "@/lib/params";

export const metadata = { title: "Reset password" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <AuthCard title="Forgot your password?" description="We'll text a verification code if an eligible account matches. A new code can be requested once every 3 days.">
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />
      <form action={forgotAction} className="space-y-4">
        <div>
          <label htmlFor="identifier" className="label">Login ID or phone number</label>
          <input id="identifier" name="identifier" required className="input" />
        </div>
        <button type="submit" className="btn btn-primary w-full">Send verification code</button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        No phone number saved? Ask your teacher for help. <Link href="/login" className="text-teal-700 hover:underline">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
