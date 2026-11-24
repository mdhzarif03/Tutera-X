const RETRY_BASE_MS = 30_000;
const RETRY_MAX_MS = 30 * 60_000;

export function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1), RETRY_MAX_MS);
}

export function smsRecipientIdFromPayload(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const id = (payload as Record<string, unknown>).smsRecipientId;
  return typeof id === "string" && id.length > 0 && id.length <= 64 ? id : null;
}
