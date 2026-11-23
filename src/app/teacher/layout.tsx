import { requireRole } from "@/lib/auth/guards";
import { AppShell } from "@/components/shell";

const NAV = [
  { href: "/teacher", label: "Overview" },
  { href: "/teacher/students", label: "Students" },
  { href: "/teacher/batches", label: "Batches" },
  { href: "/teacher/attendance", label: "Attendance" },
  { href: "/teacher/exams", label: "Exams" },
  { href: "/teacher/payments", label: "Payments" },
  { href: "/teacher/sms", label: "SMS" },
  { href: "/teacher/teachers", label: "Teachers" },
  { href: "/teacher/settings", label: "Settings" },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("TEACHER");
  return (
    <AppShell roleLabel="Teacher" userName={user.name} nav={NAV}>
      {children}
    </AppShell>
  );
}
