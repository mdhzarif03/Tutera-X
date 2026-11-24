import { UserError } from "./errors";

// Hosts a WhatsApp group or channel invite can legitimately live on.
const ALLOWED_HOSTS = new Set(["chat.whatsapp.com", "whatsapp.com", "www.whatsapp.com", "wa.me"]);

/**
 * Validates and normalises a WhatsApp group link. Returns null for an empty value (clears the link).
 * Only https links on WhatsApp's own domains are accepted, because the value is rendered as a link
 * on student dashboards and must never be a javascript: URL or an unrelated website.
 */
export function parseWhatsappLink(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (raw.length > 200) throw new UserError("The WhatsApp link must be 200 characters or fewer.");

  // Accept "chat.whatsapp.com/abc" pasted without a scheme, but refuse any other scheme.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new UserError("Enter a valid WhatsApp group link, such as https://chat.whatsapp.com/…");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UserError("Enter a valid WhatsApp group link, such as https://chat.whatsapp.com/…");
  }
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) {
    throw new UserError("That is not a WhatsApp link. Use the invite link from WhatsApp, like https://chat.whatsapp.com/…");
  }
  if (url.pathname.replace(/\//g, "") === "") {
    throw new UserError("That WhatsApp link is incomplete. Copy the full invite link from the group.");
  }
  url.protocol = "https:";
  return url.toString();
}
