"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";
import { Logo } from "@/components/logo";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Only the digest is logged. Messages can contain data, so they are not written to the console.
    console.error("[ui] unhandled error", error.digest ?? "no digest");
  }, [error]);

  return (
    <main className="auth-bg flex min-h-dvh items-center justify-center px-4">
      <div role="alert" className="tx-enter card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-6 w-fit"><Logo /></div>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600 ring-1 ring-rose-100">
          <TriangleAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-lg font-bold text-slate-900">Something did not load</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">Nothing you saved has been changed. Try again, or return to your home page.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={() => reset()} className="btn btn-primary">
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
          <Link href="/" className="btn btn-secondary">
            <Home className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
