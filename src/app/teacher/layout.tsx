import { requireRole } from "@/lib/auth/guards";
import { AppShell } from "@/components/shell";

// Settings is reached from the account menu, so it is not listed here.
const NAV = [
  { href: "/teacher", label: "Overview" },
  { href: "/teacher/attendance", label: "Attendance" },
  { href: "/teacher/students", label: "Students" },
  { href: "/teacher/batches", label: "Batches" },
  { href: "/teacher/exams", label: "Exams" },
  { href: "/teacher/payments", label: "Payments" },
  { href: "/teacher/sms", label: "SMS" },
  { href: "/teacher/teachers", label: "Team" },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("TEACHER");
  return (
    <AppShell roleLabel="Teacher" userName={user.name} nav={NAV} settingsHref="/teacher/settings" settingsLabel="Settings">
      {children}
    </AppShell>
  );
}
