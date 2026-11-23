import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="auth-bg flex min-h-dvh items-center justify-center px-4">
      <div className="tx-enter card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-6 w-fit"><Logo /></div>
        <span className="tx-float mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
          <Compass className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-lg font-bold text-slate-900">We could not find that page</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">It may have moved, or your account may not have access to it.</p>
        <Link href="/" className="btn btn-primary mt-6">Go to your home page</Link>
      </div>
    </main>
  );
}
