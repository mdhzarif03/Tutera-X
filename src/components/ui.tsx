import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  id,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`card ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

const TONES = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  good: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warn: "bg-amber-50 text-amber-800 ring-amber-200",
  bad: "bg-rose-50 text-rose-800 ring-rose-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
} as const;

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (!msg && !error) return null;
  const isError = Boolean(error);
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`mb-5 rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${
        isError ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-emerald-50 text-emerald-900 ring-emerald-200"
      }`}
    >
      {error ?? msg}
    </div>
  );
}

export function EmptyState({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 max-w-md text-sm text-slate-600">{body}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Pagination({
  basePath,
  page,
  pages,
  query,
}: {
  basePath: string;
  page: number;
  pages: number;
  query: Record<string, string>;
}) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const params = new URLSearchParams({ ...query, page: String(p) });
    return `${basePath}?${params.toString()}`;
  };
  return (
    <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      {page > 1 ? <Link className="btn btn-secondary btn-sm" href={href(page - 1)}>Previous</Link> : <span />}
      <span className="text-slate-600">
        Page {page} of {pages}
      </span>
      {page < pages ? <Link className="btn btn-secondary btn-sm" href={href(page + 1)}>Next</Link> : <span />}
    </nav>
  );
}

/** Horizontal bars for attendance or scores. Values are percentages from 0 to 100, or null for no data. */
export function Bars({ items }: { items: { label: string; value: number | null }[] }) {
  if (items.length === 0) return null;
  const width = 360;
  const height = 160;
  const pad = 24;
  const barW = Math.max(8, (width - pad * 2) / items.length - 8);
  return (
    <svg viewBox={`0 0 ${width} ${height + 28}`} className="h-auto w-full" role="img" aria-label="Chart">
      <line x1={pad} x2={width - pad} y1={height} y2={height} className="stroke-slate-200" />
      {items.map((it, i) => {
        const x = pad + i * ((width - pad * 2) / items.length) + 4;
        const v = it.value ?? 0;
        const h = (Math.min(100, Math.max(0, v)) / 100) * (height - 12);
        return (
          <g key={`${it.label}-${i}`}>
            <rect x={x} y={height - h} width={barW} height={Math.max(h, it.value === null ? 0 : 1)} rx={3} className="fill-teal-600">
              <title>{`${it.label}: ${it.value === null ? "no data" : `${it.value}%`}`}</title>
            </rect>
            <text x={x + barW / 2} y={height + 16} textAnchor="middle" className="fill-slate-500" fontSize="10">
              {it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
