import { randomInt } from "node:crypto";

export function usernameInitials(name: string): string {
  const initials = name
    .normalize("NFKD")
    .split(/\s+/u)
    .map((word) => Array.from(word).find((character) => /\p{L}/u.test(character)) ?? "")
    .join("")
    .toUpperCase();
  return initials || "ST";
}

export function randomUsernameNumber(): number {
  return randomInt(100_000, 1_000_000);
}

export function usernameCandidate(initials: string, number: number): string {
  return `${initials}-${number}`;
}
