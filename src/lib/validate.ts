import { UserError } from "./errors";
import { isTime } from "./dates";

export function requireText(value: unknown, label: string, max = 200): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new UserError(`${label} is required.`);
  if (v.length > max) throw new UserError(`${label} must be ${max} characters or fewer.`);
  return v;
}

export function optionalText(value: unknown, max = 200): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) return null;
  if (v.length > max) throw new UserError(`Text must be ${max} characters or fewer.`);
  return v;
}

export function requireNumber(value: unknown, label: string, min: number, max: number): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) throw new UserError(`${label} must be a number.`);
  if (n < min || n > max) throw new UserError(`${label} must be between ${min} and ${max}.`);
  return n;
}

export function requireTime(value: unknown, label: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!isTime(v)) throw new UserError(`${label} must be a time in HH:MM format.`);
  return v;
}

export function requireId(value: unknown, label: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v || v.length > 64) throw new UserError(`${label} is missing.`);
  return v;
}
