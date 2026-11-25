"use server";

import { redirect } from "next/navigation";
import { logUnexpectedError, UserError } from "@/lib/errors";
import { createSession, destroySession, getSessionUser } from "@/lib/auth/session";
import { roleHome } from "@/lib/auth/guards";
import {
  clearInviteCookie,
  readInviteCookie,
  clearAccountTokenCookie,
  readAccountTokenCookie,
} from "@/lib/auth/one-time";
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
  logUnexpectedError("[auth] unexpected error", { operation: "auth.action" }, err);
  return "Something went wrong. Please try again.";
}

const TOKEN_GONE = /invalid or expired|no longer valid|already been used|already active|has expired or was already used/;

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
  const token = (await readAccountTokenCookie()) ?? "";
  const password = str(formData, "password");
  const confirm = str(formData, "confirm");
  let next: string | null = null;
  let error: string | null = null;
  try {
    if (!token) throw new UserError("Open your activation link again to continue.");
    if (password !== confirm) throw new UserError("The two passwords do not match.");
    const { userId, role } = await activateAccount(token, password);
    await clearAccountTokenCookie();
    await createSession(userId);
    next = roleHome(role);
  } catch (err) {
    error = errorText(err);
    if (TOKEN_GONE.test(error)) await clearAccountTokenCookie();
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
    logUnexpectedError("[auth] reset request failed", { operation: "account.password_reset.request" }, err);
  }
  redirect("/reset?msg=If%20an%20eligible%20account%20exists%2C%20a%20verification%20code%20has%20been%20sent.");
}

export async function resetAction(formData: FormData): Promise<void> {
  const identifier = str(formData, "identifier");
  const code = str(formData, "code");
  const password = str(formData, "password");
  const confirm = str(formData, "confirm");
  let error: string | null = null;
  try {
    if (password !== confirm) throw new UserError("The two passwords do not match.");
    await resetPassword(identifier, code, password);
  } catch (err) {
    error = errorText(err);
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
    redirect("/");
  }
  if (error && TOKEN_GONE.test(error)) await clearInviteCookie();
  redirect(`/accept-invite?error=${encodeURIComponent(error ?? "Could not accept the invitation.")}`);
}

export async function changePasswordAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const home = roleHome(user.role);
  return runAction(`${home}/settings`, async () => {
    const next = str(formData, "next");
    const confirm = str(formData, "confirm");
    if (next !== confirm) throw new UserError("The new passwords do not match.");
    await changePassword(user.id, next, user.sessionId);
    return { message: "Password changed. Other devices have been signed out." };
  });
}
