// Shared sorting and grouping for teacher lists (students, payments).
// Grouping keeps the sorted order, so "Class", "Batch" and "Status" views read as sections.

export const NONE_KEY = "__none__";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Reads ?sort= and falls back to a safe default when the value is unknown. */
export function parseSort<K extends string>(value: string | undefined, allowed: readonly K[], fallback: K): K {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as K) : fallback;
}

export interface GroupKey {
  key: string;
  label: string;
  /** Groups appear in rank order. Ranks compare naturally, so "Class 9" comes before "Class 10". */
  rank: string;
}

export interface Group<T> {
  key: string;
  label: string;
  rows: T[];
}

/**
 * Splits items into labelled groups. An item may belong to several groups (a student in two batches).
 * Items keep their incoming order inside each group; the "No batch" group always sits last.
 */
export function groupRows<T>(items: T[], keysOf: (item: T) => GroupKey[]): Group<T>[] {
  const map = new Map<string, Group<T> & { rank: string }>();
  for (const item of items) {
    for (const k of keysOf(item)) {
      const existing = map.get(k.key);
      if (existing) existing.rows.push(item);
      else map.set(k.key, { key: k.key, label: k.label, rank: k.rank, rows: [item] });
    }
  }
  return [...map.values()]
    .sort((a, b) => {
      if (a.key === NONE_KEY) return 1;
      if (b.key === NONE_KEY) return -1;
      return collator.compare(a.rank, b.rank);
    })
    .map((g) => ({ key: g.key, label: g.label, rows: g.rows }));
}
