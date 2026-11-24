import { db } from "@/lib/db";

export interface Contact {
  studentId: string;
  studentName: string;
  username: string | null;
  guardianName: string;
  guardianPhone: string;
}

/** Loads the details needed to address messages about a set of students. Messages go to the guardian. */
export async function contactsFor(studentIds: string[]): Promise<Map<string, Contact>> {
  const map = new Map<string, Contact>();
  if (studentIds.length === 0) return map;
  const rows = await db.studentProfile.findMany({
    where: { userId: { in: studentIds } },
    select: {
      userId: true,
      user: { select: { name: true, username: true } },
      guardian: { select: { name: true, phoneE164: true } },
    },
  });
  for (const r of rows) {
    map.set(r.userId, {
      studentId: r.userId,
      studentName: r.user.name,
      username: r.user.username,
      guardianName: r.guardian.name,
      guardianPhone: r.guardian.phoneE164,
    });
  }
  return map;
}
