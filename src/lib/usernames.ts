const USERNAME_BASE_LENGTH = 16;

export function usernameBase(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, USERNAME_BASE_LENGTH);
  return base || "STUDENT";
}

export function usernameCandidate(base: string, sequence: number): string {
  return sequence === 1 ? base : `${base}${sequence}`;
}
