import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

// Short-lived, httpOnly, same-site cookies used to hand a secret from one request to the next
// without placing it in a URL. Each cookie is scoped to the single path that needs it.

export const INVITE_COOKIE = "tx_invite";
export const INVITE_REVEAL_COOKIE = "tx_invite_reveal";

const INVITE_TTL_SECONDS = 15 * 60;
const REVEAL_TTL_SECONDS = 5 * 60;

function secure(): boolean {
  return getEnv().NODE_ENV === "production";
}

/** Stores an accepted invitation token for the accept form. Path-scoped to /accept-invite. */
export async function setInviteCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(INVITE_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict",
    path: "/accept-invite",
    maxAge: INVITE_TTL_SECONDS,
  });
}

export async function readInviteCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(INVITE_COOKIE)?.value ?? null;
}

export async function clearInviteCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: INVITE_COOKIE, path: "/accept-invite" });
}

/** Lets the inviting owner see a freshly created link once. Path-scoped to the teachers page. */
export async function setInviteRevealCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(INVITE_REVEAL_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict",
    path: "/teacher/teachers",
    maxAge: REVEAL_TTL_SECONDS,
  });
}

export async function readInviteRevealCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(INVITE_REVEAL_COOKIE)?.value ?? null;
}

export async function clearInviteRevealCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: INVITE_REVEAL_COOKIE, path: "/teacher/teachers" });
}

// Activation and password-reset links. The token is in the URL fragment, exchanged for a cookie
// scoped to the single page that needs it, exactly like invitations.
export type AccountTokenKind = "activation" | "reset";

const ACCOUNT_COOKIE: Record<AccountTokenKind, { name: string; path: string; ttl: number }> = {
  activation: { name: "tx_activate", path: "/activate", ttl: 15 * 60 },
  reset: { name: "tx_reset", path: "/reset", ttl: 15 * 60 },
};

export async function setAccountTokenCookie(kind: AccountTokenKind, token: string): Promise<void> {
  const c = ACCOUNT_COOKIE[kind];
  const jar = await cookies();
  jar.set(c.name, token, { httpOnly: true, secure: secure(), sameSite: "strict", path: c.path, maxAge: c.ttl });
}

export async function readAccountTokenCookie(kind: AccountTokenKind): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCOUNT_COOKIE[kind].name)?.value ?? null;
}

export async function clearAccountTokenCookie(kind: AccountTokenKind): Promise<void> {
  const c = ACCOUNT_COOKIE[kind];
  const jar = await cookies();
  jar.delete({ name: c.name, path: c.path });
}

// Lets the owner see a freshly created reset link once. Path-scoped to the Team page.
export const RESET_REVEAL_COOKIE = "tx_reset_reveal";

export async function setResetRevealCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(RESET_REVEAL_COOKIE, token, { httpOnly: true, secure: secure(), sameSite: "strict", path: "/teacher/teachers", maxAge: 5 * 60 });
}

export async function readResetRevealCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(RESET_REVEAL_COOKIE)?.value ?? null;
}

export async function clearResetRevealCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: RESET_REVEAL_COOKIE, path: "/teacher/teachers" });
}
