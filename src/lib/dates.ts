import { UserError } from "./errors";

/** Bangladesh has no daylight saving time, so Asia/Dhaka is a fixed UTC+6. */
export const TZ = "Asia/Dhaka";
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Today's date in Dhaka as YYYY-MM-DD. */
export function dhakaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Current fee period in Dhaka as YYYY-MM. */
export function dhakaPeriod(now: Date = new Date()): string {
  return dhakaToday(now).slice(0, 7);
}

/** Parses YYYY-MM-DD into a UTC-midnight Date, the storage form for @db.Date columns. */
export function dateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new UserError("Enter a valid date.");
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new UserError("Enter a valid date.");
  return d;
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 3600_000);
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** The next 00:00 in Dhaka, as an absolute instant. Used to defer work until the daily quota resets. */
export function nextDhakaMidnight(now: Date = new Date()): Date {
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const nextLocalMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return new Date(nextLocalMidnight - DHAKA_OFFSET_MS);
}

export function formatDay(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(d);
}

export function formatDateTime(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function monthLabel(period: string): string {
  const [y, m] = period.split("-");
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(date);
}
