/** Converts a Prisma Decimal (or nullish) to a JavaScript number, for display and small arithmetic. */
export function num(value: { toString(): string } | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatTaka(value: number): string {
  return `৳${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
