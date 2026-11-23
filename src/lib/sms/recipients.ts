import { db } from "@/lib/db";

export interface Contact {
  studentId: string;
  studentName: string;
  username: string | null;
  studentPhone: string | null;
  guardianName: string;
  guardianPhone: string;
}

/** Loads the contact details needed to address messages about a set of students. */
export async function contactsFor(studentIds: string[]): Promise<Map<string, Contact>> {
  const map = new Map<string, Contact>();
  if (studentIds.length === 0) return map;
  const rows = await db.studentProfile.findMany({
    where: { userId: { in: studentIds } },
    select: {
      userId: true,
      user: { select: { name: true, username: true, phoneE164: true } },
      guardian: { select: { name: true, phoneE164: true } },
    },
  });
  for (const r of rows) {
    map.set(r.userId, {
      studentId: r.userId,
      studentName: r.user.name,
      username: r.user.username,
      studentPhone: r.user.phoneE164,
      guardianName: r.guardian.name,
      guardianPhone: r.guardian.phoneE164,
    });
  }
  return map;
}

/** Student's own phone when present, otherwise the guardian's. */
export function studentFirstPhone(c: Contact): string {
  return c.studentPhone ?? c.guardianPhone;
}
