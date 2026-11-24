import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

// Short-lived, httpOnly, same-site cookies used to hand a secret from one request to the next
// without placing it in a URL. Each cookie is scoped to the single path that needs it.

export const INVITE_COOKIE = "tx_invite";

const INVITE_TTL_SECONDS = 15 * 60;

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

// Activation links carry a token in the URL fragment, exchanged for a page-scoped cookie.
const ACCOUNT_COOKIE = { name: "tx_activate", path: "/activate", ttl: 15 * 60 };

export async function setAccountTokenCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACCOUNT_COOKIE.name, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "strict",
    path: ACCOUNT_COOKIE.path,
    maxAge: ACCOUNT_COOKIE.ttl,
  });
}

export async function readAccountTokenCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCOUNT_COOKIE.name)?.value ?? null;
}

export async function clearAccountTokenCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: ACCOUNT_COOKIE.name, path: ACCOUNT_COOKIE.path });
}
