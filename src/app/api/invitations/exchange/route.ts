import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { setInviteCookie } from "@/lib/auth/one-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

/**
 * Exchanges the token from the invitation link's fragment (read by the browser, never sent in the
 * request URL) for an httpOnly cookie. The token is checked against the database first, so a bad
 * or used link gets an immediate, specific answer.
 */
export async function POST(request: Request): Promise<Response> {
  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!TOKEN_PATTERN.test(token)) return Response.json({ error: "This invitation link is not valid." }, { status: 400 });

  const inv = await db.teacherInvitation.findUnique({
    where: { tokenHash: sha256(token) },
    select: { acceptedAt: true, revokedAt: true, expiresAt: true },
  });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) {
    return Response.json({ error: "This link has expired or was already used. Ask for a new one." }, { status: 404 });
  }

  await setInviteCookie(token);
  return Response.json({ ok: true });
}
