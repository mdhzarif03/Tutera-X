import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getSessionUser, type SessionUser } from "./session";

export function roleHome(role: Role): string {
  if (role === "TEACHER") return "/";
  if (role === "STUDENT") return "/student";
  return "/parent";
}

/** For layouts and pages: redirects anonymous users to sign-in and other roles to their own area. */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(roleHome(user.role));
  return user;
}
