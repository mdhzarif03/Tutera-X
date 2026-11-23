import { createHash, randomBytes, randomInt } from "node:crypto";

/** URL-safe random token. Callers store only sha256(token). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomDigits(length: number): string {
  return Array.from({ length }, () => randomInt(10)).join("");
}
