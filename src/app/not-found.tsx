import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">This page does not exist, or you do not have access to it.</p>
        <Link href="/" className="btn btn-primary mt-5">Go to your home page</Link>
      </div>
    </main>
  );
}
