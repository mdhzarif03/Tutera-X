import Link from "next/link";
import { ArrowUpDown, Check } from "lucide-react";
import { hrefWith, type Query } from "@/lib/filters";

/**
 * A "Sort" button that opens a list of options. Each option is a plain link, so it works
 * without JavaScript and keeps the current search and filters.
 */
export function SortMenu({
  basePath,
  current,
  options,
  query,
}: {
  basePath: string;
  current: string;
  options: readonly { value: string; label: string }[];
  query: Query;
}) {
  const active = options.find((o) => o.value === current) ?? options[0]!;
  return (
    <details className="relative">
      <summary className="btn btn-secondary btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
        Sort: {active.label}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-2 shadow-xl ring-1 ring-slate-200">
        <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Sort by</p>
        <ul>
          {options.map((o) => {
            const on = o.value === active.value;
            return (
              <li key={o.value}>
                <Link
                  href={hrefWith(basePath, { ...query, sort: o.value })}
                  aria-current={on ? "true" : undefined}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium ${
                    on ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {o.label}
                  {on ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
