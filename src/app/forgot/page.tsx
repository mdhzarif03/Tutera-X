import Link from "next/link";
import { forgotAction } from "@/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Flash } from "@/components/ui";
import { pick } from "@/lib/params";

export const metadata = { title: "Reset password" };

export default async function ForgotPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <AuthCard title="Reset your password" description="We send a one-hour reset link to the phone number on your account.">
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />
      <form action={forgotAction} className="space-y-4">
        <div>
          <label htmlFor="identifier" className="label">Username, phone or email</label>
          <input id="identifier" name="identifier" required className="input" />
        </div>
        <button type="submit" className="btn btn-primary w-full">Send reset link</button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        No phone number on file? Ask your teacher or the Tutera-X owner to help. <Link href="/login" className="text-teal-700 hover:underline">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
