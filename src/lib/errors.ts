/** An error whose message is safe to show to the user. Anything else is logged and hidden. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export interface ErrorLogContext {
  operation: string;
  model?: string;
  requestId?: string;
  jobId?: string;
}

const SAFE_PRISMA_META_KEYS = ["modelName", "target", "field_name", "constraint", "column", "table", "relation_name"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeMetaValue(value: unknown): string | number | boolean | string[] | undefined {
  if (typeof value === "string") return value.slice(0, 160);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.slice(0, 12).map((item) => item.slice(0, 80));
  }
  return undefined;
}

export function prismaErrorCode(err: unknown): string | undefined {
  if (!isRecord(err) || typeof err.code !== "string" || !/^P\d{4}$/.test(err.code)) return undefined;
  return err.code;
}

export function prismaRetryReason(err: unknown): string {
  return prismaErrorCode(err) ?? "internal";
}

export function logUnexpectedError(event: string, context: ErrorLogContext, err: unknown): void {
  const record = isRecord(err) ? err : null;
  const error: Record<string, unknown> = {
    name: err instanceof Error && /^[A-Za-z][A-Za-z0-9_$]{0,80}$/.test(err.name) ? err.name : "UnknownError",
  };
  const code = prismaErrorCode(err);
  if (code) error.code = code;

  if (record && isRecord(record.meta)) {
    const meta: Record<string, string | number | boolean | string[]> = {};
    for (const key of SAFE_PRISMA_META_KEYS) {
      const value = safeMetaValue(record.meta[key]);
      if (value !== undefined) meta[key] = value;
    }
    if (Object.keys(meta).length) error.meta = meta;
  }

  const model = context.model ?? (record && isRecord(record.meta) && typeof record.meta.modelName === "string"
    ? record.meta.modelName.slice(0, 80)
    : undefined);
  console.error(event, JSON.stringify({
    operation: context.operation,
    ...(model ? { model } : {}),
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.jobId ? { jobId: context.jobId } : {}),
    error,
  }));
}

export function requestIdFromHeaders(headers: Headers): string | undefined {
  const value = headers.get("x-vercel-id") ?? headers.get("x-request-id");
  return value && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : undefined;
}

export function isUniqueViolation(err: unknown): boolean {
  return prismaErrorCode(err) === "P2002";
}

export function isForeignKeyViolation(err: unknown): boolean {
  return prismaErrorCode(err) === "P2003";
}
