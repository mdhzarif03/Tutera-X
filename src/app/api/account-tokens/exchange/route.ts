import { db } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { setAccountTokenCookie, type AccountTokenKind } from "@/lib/auth/one-time";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

/**
 * Exchanges an activation or reset token (read by the browser from the URL fragment) for a
 * page-scoped httpOnly cookie. The token is checked against the database first, so an expired or
 * used link gets a specific answer and never reaches the form.
 */
export async function POST(request: Request): Promise<Response> {
  let body: { kind?: unknown; token?: unknown };
  try {
    body = (await request.json()) as { kind?: unknown; token?: unknown };
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const kind: AccountTokenKind | null = body.kind === "activation" || body.kind === "reset" ? body.kind : null;
  const token = typeof body.token === "string" ? body.token : "";
  if (!kind || !TOKEN_PATTERN.test(token)) {
    return Response.json({ error: "This link is not valid." }, { status: 400 });
  }

  const hash = sha256(token);
  const now = new Date();
  const record =
    kind === "activation"
      ? await db.studentActivation.findUnique({ where: { tokenHash: hash }, select: { usedAt: true, expiresAt: true } })
      : await db.passwordResetToken.findUnique({ where: { tokenHash: hash }, select: { usedAt: true, expiresAt: true } });

  if (!record || record.usedAt || record.expiresAt < now) {
    return Response.json(
      {
        error:
          kind === "activation"
            ? "This welcome link has expired or was already used. Ask your teacher for a new one."
            : "This reset link has expired or was already used. Request a new one.",
      },
      { status: 404 },
    );
  }

  await setAccountTokenCookie(kind, token);
  return Response.json({ ok: true });
}
