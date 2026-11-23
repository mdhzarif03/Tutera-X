import type { Prisma } from "@prisma/client";

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  changes?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Writes an audit row inside the caller's transaction, so an audited change and its
 * record commit or roll back together. Callers must never pass passwords, tokens or full phone numbers.
 */
export async function audit(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      changes: (entry.changes ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: entry.ip ?? null,
    },
  });
}
