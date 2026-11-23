"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Only the digest is logged. Error messages can contain data, so they are not sent to the console.
    console.error("[ui] unhandled error", error.digest ?? "no digest");
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div role="alert" className="card max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">The page could not be loaded. Your saved data is unchanged. Try again, or go back to your home page.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button type="button" onClick={() => reset()} className="btn btn-primary">Try again</button>
          <Link href="/" className="btn btn-secondary">Home</Link>
        </div>
      </div>
    </main>
  );
}
