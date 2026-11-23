import { requireRole } from "@/lib/auth/guards";
import { AppShell } from "@/components/shell";

// Settings is reached from the account menu.
const NAV = [{ href: "/parent", label: "Home" }];

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("PARENT");
  return (
    <AppShell roleLabel="Parent" userName={user.name} nav={NAV} settingsHref="/parent/settings" settingsLabel="Settings">
      {children}
    </AppShell>
  );
}
