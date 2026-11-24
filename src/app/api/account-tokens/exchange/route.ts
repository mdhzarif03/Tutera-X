import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { setAccountTokenCookie } from "@/lib/auth/one-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

/**
 * Exchanges an activation token (read by the browser from the URL fragment) for a page-scoped
 * httpOnly cookie. Reset now uses an SMS code instead of a link token.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { kind?: unknown; token?: unknown };
  try {
    body = (await request.json()) as { kind?: unknown; token?: unknown };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const kind = body.kind === "activation" ? "activation" : null;
  const token = typeof body.token === "string" ? body.token : "";
  if (!kind || !TOKEN_PATTERN.test(token)) {
    return Response.json({ error: "This link is not valid." }, { status: 400 });
  }

  const hash = sha256(token);
  const now = new Date();
  const record = await db.studentActivation.findUnique({
    where: { tokenHash: hash },
    select: { usedAt: true, expiresAt: true },
  });

  if (!record || record.usedAt || record.expiresAt < now) {
    return Response.json(
      { error: "This welcome link has expired or was already used. Ask your teacher for a new one." },
      { status: 404 },
    );
  }

  await setAccountTokenCookie(token);
  return Response.json({ ok: true });
}
