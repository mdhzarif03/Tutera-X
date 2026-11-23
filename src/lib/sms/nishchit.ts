import { getEnv } from "@/lib/env";

/**
 * Typed client for the Nishchit REST API. Server-only: it reads the API key from the environment
 * and must never be imported by a client component. Provider messages are not forwarded to users.
 */

export class NishchitError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
    readonly retryable: boolean,
    readonly requestId: string | null = null,
  ) {
    super(message);
    this.name = "NishchitError";
  }
}

export interface NishchitMessage {
  id: string;
  status: "accepted" | "sending" | "sent" | "failed";
  delivery_status: "unknown" | "delivered" | "undelivered" | "rejected";
  segments: number;
  credits: number;
  encoding: string;
  error: { code: string; message: string; retryable: boolean } | null;
}

export interface NishchitBalance {
  credits: number;
  currency: string;
  as_of: string;
}

const RETRYABLE_CODES = new Set(["rate_limit_exceeded", "gateway_unavailable", "idempotency_conflict", "timeout", "network_error"]);

function apiKey(): string {
  const key = getEnv().NISHCHIT_API_KEY;
  if (!key) throw new NishchitError("not_configured", "The SMS provider is not configured.", 0, false);
  return key;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const key = apiKey();
  const base = getEnv().NISHCHIT_API_BASE_URL.replace(/\/$/, "");

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new NishchitError(timedOut ? "timeout" : "network_error", "Could not reach the SMS provider.", 0, true);
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const err = (json as { error?: { code?: unknown; request_id?: unknown } } | null)?.error;
    const code = typeof err?.code === "string" ? err.code : `http_${res.status}`;
    const requestId =
      typeof err?.request_id === "string" ? err.request_id : (res.headers.get("x-request-id") ?? null);
    const retryable = RETRYABLE_CODES.has(code) || res.status >= 500;
    throw new NishchitError(code, providerMessage(code), res.status, retryable, requestId);
  }
  return json as T;
}

function providerMessage(code: string): string {
  switch (code) {
    case "authentication_failed":
      return "The SMS provider rejected the API key.";
    case "insufficient_credits":
      return "The SMS account has no credits left.";
    case "daily_quota_exceeded":
      return "The daily SMS limit for this account has been reached.";
    case "content_rejected":
      return "The message was blocked by the SMS provider's content policy.";
    case "invalid_recipient":
    case "unsupported_country":
      return "The recipient number is not a valid Bangladesh mobile number.";
    default:
      return "The SMS provider could not process this request.";
  }
}

export async function sendMessage(input: {
  to: string;
  body: string;
  reference: string;
  idempotencyKey: string;
}): Promise<NishchitMessage> {
  return call<NishchitMessage>(
    "POST",
    "/v1/messages",
    { to: input.to, body: input.body, reference: input.reference },
    input.idempotencyKey,
  );
}

export async function getBalance(): Promise<NishchitBalance> {
  return call<NishchitBalance>("GET", "/v1/balance");
}

/** Test keys never reach a carrier, so they are always allowed. Live keys need ALLOW_LIVE_SMS=true. */
export function liveSendingAllowed(): boolean {
  const key = getEnv().NISHCHIT_API_KEY ?? "";
  if (key.startsWith("nk_live_")) return getEnv().ALLOW_LIVE_SMS;
  return true;
}

export function providerMode(): "live" | "test" | "unconfigured" {
  const key = getEnv().NISHCHIT_API_KEY ?? "";
  if (!key) return "unconfigured";
  return key.startsWith("nk_live_") ? "live" : "test";
}

export interface NishchitPreview {
  encoding: "gsm7" | "ucs2";
  characters: number;
  segments: number;
  credits_per_message: number;
  total_credits: number;
}

/**
 * POST /v1/pricing/preview. Authoritative for price: returns the encoding, segments and credits the
 * provider will bill for the body, for `recipients` copies of it. Sends no message and spends nothing.
 */
export async function previewPrice(body: string, recipients: number): Promise<unknown> {
  return call<unknown>("POST", "/v1/pricing/preview", { body, recipients });
}
