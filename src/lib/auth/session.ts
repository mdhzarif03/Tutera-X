import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { Role, TeacherRole } from "@prisma/client";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { ensureStartup } from "@/lib/startup";

export const SESSION_COOKIE = "tx_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export interface SessionUser {
  id: string;
  sessionId: string;
  role: Role;
  name: string;
  username: string | null;
  phoneE164: string | null;
  teacherRole: TeacherRole | null;
}

function clientIp(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for");
  return forwarded ? (forwarded.split(",")[0]?.trim() ?? null) : null;
}

/** Creates a server-side session and sets its cookie. Call only from Server Actions or Route Handlers. */
export async function createSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const h = await headers();
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      csrfSecret: randomToken(16),
      ipAddress: clientIp(h),
      userAgent: (h.get("user-agent") ?? "").slice(0, 300),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + SESSION_TTL_MS),
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** The signed-in user for this request, or null. Memoised per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  await ensureStartup();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { teacherProfile: { select: { role: true } } } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  const u = session.user;
  if (u.deletedAt || u.status !== "ACTIVE") return null;

  return {
    id: u.id,
    sessionId: session.id,
    role: u.role,
    name: u.name,
    username: u.username,
    phoneE164: u.phoneE164,
    teacherRole: u.teacherProfile?.role ?? null,
  };
});
