import { requireRole } from "@/lib/auth/guards";
import { AppShell } from "@/components/shell";

// Settings is reached from the account menu, so it is not listed here.
const NAV = [
  { href: "/", label: "Overview" },
  { href: "/attendance", label: "Attendance" },
  { href: "/students", label: "Students" },
  { href: "/batches", label: "Batches" },
  { href: "/exams", label: "Exams" },
  { href: "/payments", label: "Payments" },
  { href: "/sms", label: "SMS" },
  { href: "/teachers", label: "Team" },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("TEACHER");
  return (
    <AppShell roleLabel="Teacher" userName={user.name} nav={NAV} settingsHref="/settings" settingsLabel="Settings">
      {children}
    </AppShell>
  );
}
