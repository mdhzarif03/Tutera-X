import Link from "next/link";
import { loginAction } from "@/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { Flash } from "@/components/ui";
import { pick } from "@/lib/params";
import { ensureStartup } from "@/lib/startup";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await ensureStartup();
  const sp = await searchParams;
  return (
    <AuthCard title="Sign in" description="Teachers use email. Students and parents use the username from their activation message or their phone number.">
      <Flash msg={pick(sp, "msg")} error={pick(sp, "error")} />
      <form action={loginAction} className="space-y-4">
        <div>
          <label htmlFor="identifier" className="label">Email, username or phone</label>
          <input id="identifier" name="identifier" required autoComplete="username" className="input" placeholder="you@example.com or S483920" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        <button type="submit" className="btn btn-primary w-full">Sign in</button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-600">
        <Link href="/forgot" className="font-medium text-teal-700 hover:underline">Forgot your password?</Link>
      </p>
    </AuthCard>
  );
}
