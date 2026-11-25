import { formatTaka } from "@/lib/money";

/** Money received per month, drawn as bars. Scales to the highest month. Server-rendered, no JavaScript. */
export function CollectionBars({ items }: { items: { label: string; period: string; amount: number }[] }) {
  if (items.length === 0) return null;
  const max = Math.max(1, ...items.map((i) => i.amount));
  const width = 360;
  const height = 150;
  const pad = 12;
  const labelH = 26;
  const slot = (width - pad * 2) / items.length;
  const barW = Math.max(8, Math.min(26, slot - 8));
  const base = height;

  return (
    <svg viewBox={`0 0 ${width} ${height + labelH}`} className="h-auto w-full" role="img" aria-label="Money collected each month">
      <defs>
        <linearGradient id="tx-collect" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <line x1={pad} x2={width - pad} y1={base} y2={base} className="stroke-slate-200" />
      {items.map((it, i) => {
        const x = pad + i * slot + (slot - barW) / 2;
        const h = it.amount > 0 ? Math.max(3, (it.amount / max) * (height - 14)) : 0;
        return (
          <g key={it.period}>
            <rect x={x} y={base - h} width={barW} height={h} rx={6} fill="url(#tx-collect)" className="tx-bar" style={{ animationDelay: `${i * 50}ms`, transformBox: "fill-box" }}>
              <title>{`${it.label}: ${formatTaka(it.amount)}`}</title>
            </rect>
            <text x={x + barW / 2} y={base + 18} textAnchor="middle" className="fill-slate-500" fontSize="10" fontWeight="600">
              {it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
