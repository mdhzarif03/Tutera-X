"use server";

import { redirect } from "next/navigation";
import { UserError } from "@/lib/errors";
import { createSession, destroySession, getSessionUser } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/guards";
import { clearInviteCookie, readInviteCookie, clearAccountTokenCookie, readAccountTokenCookie } from "@/lib/auth/one-time";
import { runAction } from "@/lib/action";
import { str } from "@/lib/form";
import {
  activateAccount,
  changePassword,
  loginWithPassword,
  requestPasswordReset,
  resetPassword,
} from "@/services/accounts";
import { acceptInvitation } from "@/services/teachers";
import { ensureStartup } from "@/lib/startup";

function errorText(err: unknown): string {
  if (err instanceof UserError) return err.message;
  console.error("[auth] unexpected error:", err instanceof Error ? err.name : "unknown");
  return "Something went wrong. Please try again.";
}

const TOKEN_GONE = /invalid or has expired|already been used|already active|has expired or was already used/;

export async function loginAction(formData: FormData): Promise<void> {
  await ensureStartup();
  const identifier = str(formData, "identifier");
  const password = str(formData, "password");
  let next: string | null = null;
  let error: string | null = null;
  try {
    const { userId, role } = await loginWithPassword(identifier, password);
    await createSession(userId);
    next = roleHome(role);
  } catch (err) {
    error = errorText(err);
  }
  if (next) redirect(next);
  redirect(`/login?error=${encodeURIComponent(error ?? "Sign-in failed.")}`);
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function activateAction(formData: FormData): Promise<void> {
  const token = (await readAccountTokenCookie("activation")) ?? "";
  const password = str(formData, "password");
  const confirm = str(formData, "confirm");
  let next: string | null = null;
  let error: string | null = null;
  try {
    if (!token) throw new UserError("Open your activation link again to continue.");
    if (password !== confirm) throw new UserError("The two passwords do not match.");
    const { userId, role } = await activateAccount(token, password);
    await clearAccountTokenCookie("activation");
    await createSession(userId);
    next = roleHome(role);
  } catch (err) {
    error = errorText(err);
    if (TOKEN_GONE.test(error)) await clearAccountTokenCookie("activation");
  }
  if (next) redirect(next);
  redirect(`/activate?error=${encodeURIComponent(error ?? "Activation failed.")}`);
}

export async function forgotAction(formData: FormData): Promise<void> {
  const identifier = str(formData, "identifier");
  // Same response whether or not the account exists, so the form cannot reveal accounts.
  try {
    await requestPasswordReset(identifier);
  } catch (err) {
    console.error("[auth] reset request failed:", err instanceof Error ? err.name : "unknown");
  }
  redirect("/forgot?msg=If%20an%20account%20has%20a%20phone%20number%20on%20file%2C%20we%20have%20sent%20a%20reset%20link.");
}

export async function resetAction(formData: FormData): Promise<void> {
  const token = (await readAccountTokenCookie("reset")) ?? "";
  const password = str(formData, "password");
  const confirm = str(formData, "confirm");
  let error: string | null = null;
  try {
    if (!token) throw new UserError("Open your reset link again to continue.");
    if (password !== confirm) throw new UserError("The two passwords do not match.");
    await resetPassword(token, password);
    await clearAccountTokenCookie("reset");
  } catch (err) {
    error = errorText(err);
    if (TOKEN_GONE.test(error)) await clearAccountTokenCookie("reset");
  }
  if (error) redirect(`/reset?error=${encodeURIComponent(error)}`);
  redirect("/login?msg=Your%20password%20has%20been%20updated.%20Sign%20in%20to%20continue.");
}

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = (await readInviteCookie()) ?? "";
  const name = str(formData, "name");
  const subjects = str(formData, "subjects");
  const institutionName = str(formData, "institutionName");
  const password = str(formData, "password");
  const confirm = str(formData, "confirm");
  let userId: string | null = null;
  let error: string | null = null;
  try {
    if (!token) throw new UserError("Open the invitation link again to continue.");
    if (password !== confirm) throw new UserError("The two passwords do not match.");
    userId = await acceptInvitation(token, name, subjects, institutionName, password);
  } catch (err) {
    error = errorText(err);
  }
  if (userId) {
    await clearInviteCookie();
    await createSession(userId);
    redirect("/teacher");
  }
  if (error && TOKEN_GONE.test(error)) await clearInviteCookie();
  redirect(`/accept-invite?error=${encodeURIComponent(error ?? "Could not accept the invitation.")}`);
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const home = roleHome(user.role);
  return runAction(`${home}/settings`, async () => {
    const current = str(formData, "current");
    const next = str(formData, "next");
    const confirm = str(formData, "confirm");
    if (next !== confirm) throw new UserError("The new passwords do not match.");
    await changePassword(user.id, current, next);
    return { message: "Password changed. Other devices have been signed out." };
  });
}
