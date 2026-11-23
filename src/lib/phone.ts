import { UserError } from "./errors";

/** Normalises a Bangladesh mobile number to E.164 (+8801XXXXXXXXX). */
export function normalizeBdPhone(input: string): string {
  const cleaned = input.replace(/[\s\-()]/g, "");
  const patterns = [/^\+8801([3-9]\d{8})$/, /^8801([3-9]\d{8})$/, /^01([3-9]\d{8})$/];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m?.[1]) return `+8801${m[1]}`;
  }
  throw new UserError("Enter a valid Bangladesh mobile number, for example 01712345678.");
}

export function looksLikePhone(input: string): boolean {
  return /^(\+?880|0)1[3-9]\d{8}$/.test(input.replace(/[\s\-()]/g, ""));
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 6)}••••${phone.slice(-3)}`;
}
