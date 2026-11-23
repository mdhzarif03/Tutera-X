import { requireRole } from "@/lib/auth/guards";
import { AppShell } from "@/components/shell";

const NAV = [
  { href: "/parent", label: "Home" },
  { href: "/parent/settings", label: "Settings" },
];

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("PARENT");
  return (
    <AppShell roleLabel="Parent" userName={user.name} nav={NAV}>
      {children}
    </AppShell>
  );
}
