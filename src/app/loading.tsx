export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-4" aria-label="Loading">
      <div className="h-8 w-56 rounded bg-slate-200" />
      <div className="h-4 w-80 rounded bg-slate-100" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-white ring-1 ring-slate-200" />)}
      </div>
      <div className="h-64 rounded-xl bg-white ring-1 ring-slate-200" />
    </div>
  );
}
