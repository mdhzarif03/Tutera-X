export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className="space-y-6">
      <div className="space-y-3">
        <div className="tx-skeleton h-3 w-24 rounded-full" />
        <div className="tx-skeleton h-9 w-72 rounded-xl" />
        <div className="tx-skeleton h-4 w-96 max-w-full rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card space-y-4 p-5">
            <div className="tx-skeleton h-3 w-20 rounded-full" />
            <div className="tx-skeleton h-8 w-24 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="card space-y-4 p-6">
        <div className="tx-skeleton h-4 w-40 rounded-full" />
        <div className="tx-skeleton h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
