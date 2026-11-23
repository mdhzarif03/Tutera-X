import { redirect } from "next/navigation";
import { UserError } from "./errors";

export interface ActionOutcome {
  message?: string;
  redirectTo?: string;
}

function withFlash(path: string, kind: "msg" | "error", text: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.delete(kind === "msg" ? "error" : "msg");
  url.searchParams.set(kind, text);
  return `${url.pathname}${url.search}`;
}

/**
 * Runs a form mutation and redirects with a flash message. Only UserError text reaches the
 * user; anything else is logged by name and replaced with a generic message.
 */
export async function runAction(
  basePath: string,
  fn: () => Promise<ActionOutcome | void>,
): Promise<never> {
  let kind: "msg" | "error" = "msg";
  let text = "Saved.";
  let redirectTo: string | undefined;
  try {
    const out = await fn();
    if (out?.message) text = out.message;
    redirectTo = out?.redirectTo;
  } catch (err) {
    kind = "error";
    if (err instanceof UserError) {
      text = err.message;
    } else {
      console.error("[action] failed:", basePath, err instanceof Error ? err.name : "unknown error");
      text = "Something went wrong. Please try again.";
    }
  }
  redirect(withFlash(kind === "error" ? basePath : redirectTo ?? basePath, kind, text));
}
