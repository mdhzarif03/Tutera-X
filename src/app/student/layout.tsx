import { requireRole } from "@/lib/auth/guards";
import { AppShell } from "@/components/shell";

const NAV = [
  { href: "/student", label: "Home" },
  { href: "/student/attendance", label: "Attendance" },
  { href: "/student/exams", label: "Exams" },
  { href: "/student/payments", label: "Payments" },
  { href: "/student/profile", label: "Profile" },
];

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("STUDENT");
  return (
    <AppShell roleLabel="Student" userName={user.name} nav={NAV}>
      {children}
    </AppShell>
  );
}
