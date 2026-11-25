import Link from "next/link";
import { Filter, X } from "lucide-react";
import { hrefWith, selectionQuery, type FilterGroup, type Query } from "@/lib/filters";

/** Hidden inputs that carry the current query through a GET form. */
export function HiddenFields({ query }: { query: Query }) {
  return (
    <>
      {Object.entries(query).flatMap(([k, v]) =>
        (Array.isArray(v) ? v : v ? [v] : []).map((x) => <input key={`${k}-${x}`} type="hidden" name={k} value={x} />),
      )}
    </>
  );
}

/**
 * A "Filters" button that opens a panel of tick-able chips, grouped by batch, class, version and so on.
 * Submitting replaces the selection. "Clear all" resets only the filters and keeps sort and search.
 */
export function FilterPanel({ basePath, groups, keep }: { basePath: string; groups: FilterGroup[]; keep: Query }) {
  const active = groups.reduce((n, g) => n + g.selected.length, 0);
  const visible = groups.filter((g) => g.options.length > 0);
  return (
    <details className="relative">
      <summary className="btn btn-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <Filter className="h-4 w-4" aria-hidden="true" />
        Filters
        {active > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-bold text-white">{active}</span>
        ) : null}
      </summary>
      <form
        method="get"
        action={basePath}
        className="absolute left-0 z-30 mt-2 flex max-h-[70dvh] w-[min(92vw,30rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200"
      >
        <HiddenFields query={keep} />
        <div className="space-y-5 overflow-y-auto p-4">
          {visible.map((g) => (
            <fieldset key={g.name}>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{g.title}</legend>
              <div className="flex flex-wrap gap-2">
                {g.options.map((o) => (
                  <label key={o.value} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name={g.name}
                      value={o.value}
                      defaultChecked={g.selected.includes(o.value)}
                      className="peer sr-only"
                    />
                    <span className="inline-flex items-center rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-100 peer-checked:bg-indigo-600 peer-checked:text-white peer-checked:ring-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400">
                      {o.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3">
          <Link href={hrefWith(basePath, keep)} className="btn btn-secondary btn-sm">
            Clear all
          </Link>
          <button type="submit" className="btn btn-primary btn-sm">
            Show results
          </button>
        </div>
      </form>
    </details>
  );
}

/** Chips for the active filters, each removable, plus how many rows are showing. Renders nothing when no filter is on. */
export function ActiveFilters({
  basePath,
  groups,
  keep,
  shown,
  total,
}: {
  basePath: string;
  groups: FilterGroup[];
  keep: Query;
  shown: number;
  total: number;
}) {
  const chips = groups.flatMap((g) =>
    g.selected.map((v) => ({
      key: `${g.name}-${v}`,
      label: `${g.title}: ${g.options.find((o) => o.value === v)?.label ?? v}`,
      href: hrefWith(basePath, {
        ...keep,
        ...selectionQuery(groups.map((x) => (x.name === g.name ? { ...x, selected: x.selected.filter((s) => s !== v) } : x))),
      }),
    })),
  );
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-1 text-xs text-slate-500">
        Showing <span className="font-semibold text-slate-800">{shown}</span> of {total}
      </p>
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100"
        >
          {c.label}
          <X className="h-3 w-3" aria-hidden="true" />
        </Link>
      ))}
      <Link href={hrefWith(basePath, keep)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
        Clear all
      </Link>
    </div>
  );
}
