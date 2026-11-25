// Multi-select filters for teacher lists. Filters live in the URL (?batch=A&batch=B&class=Class+11),
// so a filtered view can be bookmarked, shared, and survives a refresh. No JavaScript is needed.
// Rules: values inside one filter are OR-ed (any of the chosen batches); filters are AND-ed together.

import { NONE_KEY } from "./sort";

export type Query = Record<string, string | string[] | undefined>;

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  name: string;
  title: string;
  options: FilterOption[];
  selected: string[];
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** All chosen values for one filter key, cleaned and capped. */
export function multi(sp: Query, key: string): string[] {
  const v = sp[key];
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return [...new Set(list.map((s) => s.trim().slice(0, 80)).filter(Boolean))].slice(0, 100);
}

/** Distinct values as options, in natural order. The "No batch" option always goes last. */
export function optionsFrom(values: string[], labelOf: (v: string) => string = (v) => v): FilterOption[] {
  return [...new Set(values)]
    .sort((a, b) => {
      if (a === NONE_KEY) return 1;
      if (b === NONE_KEY) return -1;
      return collator.compare(a, b);
    })
    .map((value) => ({ value, label: labelOf(value) }));
}

/** A link to basePath with the given query. Keys set to undefined or empty arrays are dropped. */
export function hrefWith(basePath: string, query: Query): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    for (const item of Array.isArray(v) ? v : [v]) if (item !== "") usp.append(k, item);
  }
  const s = usp.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** The query that reproduces the current filter selection. */
export function selectionQuery(groups: FilterGroup[]): Query {
  const out: Query = {};
  for (const g of groups) if (g.selected.length) out[g.name] = g.selected;
  return out;
}

/** AND across the checks, OR within each one. An unselected check matches everything. */
export function matchesAll(checks: { selected: string[]; values: string[] }[]): boolean {
  return checks.every(({ selected, values }) => selected.length === 0 || values.some((v) => selected.includes(v)));
}
