import type { Role } from "@prisma/client";
import { getSessionUser, type SessionUser } from "./session";

/** Route-handler equivalent of requireRole: returns null instead of redirecting. */
export async function requireApiRole(role: Role): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || user.role !== role) return null;
  return user;
}
