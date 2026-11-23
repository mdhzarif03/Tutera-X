import { NishchitError, previewPrice, providerMode } from "./nishchit";
import { analyzeSms } from "./segments";
import { PLATFORM_PREFIX } from "./templates";

export interface SendQuote {
  /** "provider" when Nishchit priced the send; "local" when the local rules were used instead. */
  source: "provider" | "local";
  encoding: "gsm7" | "ucs2";
  segmentsPerMessage: number;
  creditsPerMessage: number;
  totalCredits: number;
  /** Why the local estimate was used, when it was. A stable code, never a provider message. */
  reason?: string;
}

export interface ProviderPreview {
  encoding: "gsm7" | "ucs2";
  characters: number;
  segments: number;
  credits_per_message: number;
  total_credits: number;
}

export class InvalidPreviewError extends Error {
  readonly code = "invalid_response";
  constructor() {
    super("The provider returned an unexpected pricing response.");
    this.name = "InvalidPreviewError";
  }
}

/** Validates a provider pricing response. Anything unexpected is rejected rather than trusted. */
export function parseProviderPreview(raw: unknown): ProviderPreview {
  const r = (raw ?? {}) as Record<string, unknown>;
  const count = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
  if (
    (r.encoding !== "gsm7" && r.encoding !== "ucs2") ||
    !count(r.characters) ||
    !count(r.segments) ||
    !count(r.credits_per_message) ||
    !count(r.total_credits)
  ) {
    throw new InvalidPreviewError();
  }
  return {
    encoding: r.encoding,
    characters: r.characters as number,
    segments: r.segments as number,
    credits_per_message: r.credits_per_message as number,
    total_credits: r.total_credits as number,
  };
}

/** The local rules, used only when the provider cannot price the send. Same GSM-7 / UCS-2 maths. */
export function localQuote(body: string, recipients: number, reason?: string): SendQuote {
  const a = analyzeSms(`[${PLATFORM_PREFIX}] ${body}`);
  return {
    source: "local",
    encoding: a.encoding,
    segmentsPerMessage: a.segments,
    creditsPerMessage: a.segments,
    totalCredits: a.segments * recipients,
    reason,
  };
}

/**
 * Prices a send before it is queued.
 *
 * The body is priced with the platform prefix included. That is conservative whether or not the
 * provider adds the prefix itself, because a double-counted prefix only over-reserves.
 *
 * Fallback policy: if the provider is not configured, unreachable, or answers with something we
 * cannot validate, the local rules are used and the quote's `source` says so. A local quote can be
 * slightly wrong, which is why per-recipient reservations also take the larger of the two figures
 * (see queueSms) and any remaining difference is handled by the settlement policy in allowance.ts.
 */
export async function quoteSend(body: string, recipients: number): Promise<SendQuote> {
  if (recipients <= 0) return localQuote(body, 0);
  if (providerMode() === "unconfigured") return localQuote(body, recipients, "provider_not_configured");

  try {
    const raw = await previewPrice(`[${PLATFORM_PREFIX}] ${body}`, recipients);
    const p = parseProviderPreview(raw);
    return {
      source: "provider",
      encoding: p.encoding,
      segmentsPerMessage: p.segments,
      creditsPerMessage: p.credits_per_message,
      totalCredits: p.total_credits,
    };
  } catch (err) {
    const reason =
      err instanceof NishchitError ? err.code : err instanceof InvalidPreviewError ? err.code : "unknown";
    console.warn("[pricing] provider quote unavailable, using the local estimate. Reason:", reason);
    return localQuote(body, recipients, reason);
  }
}
