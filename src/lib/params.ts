/** First value of a search parameter, or undefined. */
export function pick(params: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Converts ?page= into a safe positive integer. */
export function pageParam(params: Record<string, string | string[] | undefined>): number {
  const n = Number(pick(params, "page") ?? "1");
  return Number.isInteger(n) && n > 0 && n < 100_000 ? n : 1;
}
