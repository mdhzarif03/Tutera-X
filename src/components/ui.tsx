import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox, XCircle } from "lucide-react";

// Shared building blocks. Every export keeps its name and props, so screens written against
// earlier versions keep working. Only the appearance has changed.

type Tone = "brand" | "good" | "warn" | "bad" | "info" | "neutral";

const TONE: Record<Tone, { bar: string; icon: string; chip: string }> = {
  brand: { bar: "bar-brand", icon: "bg-indigo-50 text-indigo-600 ring-indigo-100", chip: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  good: { bar: "bar-good", icon: "bg-emerald-50 text-emerald-600 ring-emerald-100", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  warn: { bar: "bar-warn", icon: "bg-amber-50 text-amber-600 ring-amber-100", chip: "bg-amber-50 text-amber-900 ring-amber-200" },
  bad: { bar: "bar-bad", icon: "bg-rose-50 text-rose-600 ring-rose-100", chip: "bg-rose-50 text-rose-800 ring-rose-200" },
  info: { bar: "bar-info", icon: "bg-sky-50 text-sky-600 ring-sky-100", chip: "bg-sky-50 text-sky-800 ring-sky-200" },
  neutral: { bar: "bar-neutral", icon: "bg-slate-100 text-slate-600 ring-slate-200", chip: "bg-slate-100 text-slate-700 ring-slate-200" },
};

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="tx-enter mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-8">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-xl font-bold tracking-tight text-slate-900 min-[400px]:text-2xl sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
  id,
  icon,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  icon?: ReactNode;
}) {
  return (
    <section id={id} className={`card tx-enter ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600">{icon}</span> : null}
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
              {description ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p> : null}
            </div>
          </div>
          {actions}
        </header>
      ) : null}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <div className="card card-interactive tx-enter relative overflow-hidden p-5">
      <span className={`absolute inset-x-0 top-0 h-1 ${t.bar}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        {icon ? <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${t.icon}`}>{icon}</span> : null}
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONE[tone].chip}`}>
      {children}
    </span>
  );
}

export function Flash({ msg, error }: { msg?: string; error?: string }) {
  if (!msg && !error) return null;
  const isError = Boolean(error);
  const Icon = isError ? XCircle : CheckCircle2;
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`tx-pop mb-6 flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm font-medium ring-1 ring-inset ${
        isError ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-emerald-50 text-emerald-900 ring-emerald-200"
      }`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${isError ? "text-rose-600" : "text-emerald-600"}`} aria-hidden="true" />
      <span className="leading-relaxed">{error ?? msg}</span>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  children,
  icon,
}: {
  title: string;
  body: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="tx-enter dot-grid flex flex-col items-center rounded-2xl border border-dashed border-indigo-200 bg-gradient-to-b from-white to-indigo-50/40 px-6 py-12 text-center">
      <span className="tx-float grid h-14 w-14 place-items-center rounded-2xl bg-white text-indigo-500 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-100">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden="true" />}
      </span>
      <p className="mt-5 text-base font-semibold text-slate-900">{title}</p>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{body}</p>
      {children ? <div className="mt-5">{children}</div> : null}
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
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
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
  const href = (p: number) => `${basePath}?${new URLSearchParams({ ...query, page: String(p) }).toString()}`;
  return (
    <nav className="mt-5 flex items-center justify-between gap-3 text-sm" aria-label="Pagination">
      {page > 1 ? (
        <Link className="btn btn-secondary btn-sm" href={href(page - 1)}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link className="btn btn-secondary btn-sm" href={href(page + 1)}>
          Next
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Vertical bars, percentages 0 to 100. Bars rise in sequence when the card appears. */
export function Bars({ items }: { items: { label: string; value: number | null }[] }) {
  if (items.length === 0) return null;
  const width = 360;
  const height = 150;
  const pad = 16;
  const slot = (width - pad * 2) / items.length;
  const barW = Math.max(10, Math.min(36, slot - 12));
  return (
    <svg viewBox={`0 0 ${width} ${height + 30}`} className="h-auto w-full" role="img" aria-label="Performance chart">
      <defs>
        <linearGradient id="tx-bars" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      {[0, 50, 100].map((g) => (
        <line
          key={g}
          x1={pad}
          x2={width - pad}
          y1={height - (g / 100) * (height - 12)}
          y2={height - (g / 100) * (height - 12)}
          className="stroke-slate-200"
          strokeDasharray={g === 0 ? undefined : "3 4"}
        />
      ))}
      {items.map((it, i) => {
        const x = pad + i * slot + (slot - barW) / 2;
        const v = it.value ?? 0;
        const h = (Math.min(100, Math.max(0, v)) / 100) * (height - 12);
        return (
          <g key={`${it.label}-${i}`}>
            <rect
              x={x}
              y={height - h}
              width={barW}
              height={Math.max(h, it.value === null ? 0 : 3)}
              rx={6}
              fill="url(#tx-bars)"
              className="tx-bar"
              style={{ animationDelay: `${i * 70}ms`, transformBox: "fill-box" }}
            >
              <title>{`${it.label}: ${it.value === null ? "no data" : `${it.value}%`}`}</title>
            </rect>
            <text x={x + barW / 2} y={height + 18} textAnchor="middle" className="fill-slate-500" fontSize="10" fontWeight="600">
              {it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Small inline notice for guidance inside a card. */
export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  const cls = tone === "warn" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-sky-50 text-sky-900 ring-sky-200";
  return (
    <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${cls}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}
