import Link from "next/link";
import type { ReactNode } from "react";
import { NavLinks, type NavItem } from "./nav-links";
import { Logo } from "./logo";
import { ProfileMenu } from "./profile-menu";

// One calm frame for every role: the brand, the main navigation, and the account menu.
// Settings and sign out live in the account menu, not in the navigation.
export function AppShell({
  roleLabel,
  userName,
  nav,
  settingsHref,
  settingsLabel,
  children,
}: {
  roleLabel: string;
  userName: string;
  nav: NavItem[];
  settingsHref: string;
  settingsLabel: string;
  children: ReactNode;
}) {
  const home = nav[0]?.href ?? "/";
  const initials =
    userName
      .split(" ")
      .map((p) => p.charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "TX";

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link href={home} className="shrink-0" aria-label="Tutera-X home">
            <Logo />
          </Link>

          <div className="hidden min-w-0 flex-1 justify-center xl:flex">
            <NavLinks items={nav} variant="top" />
          </div>

          <div className="ml-auto">
            <ProfileMenu
              name={userName}
              roleLabel={roleLabel}
              initials={initials}
              settingsHref={settingsHref}
              settingsLabel={settingsLabel}
            />
          </div>
        </div>

        <div className="border-t border-slate-100 xl:hidden">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <NavLinks items={nav} variant="tabs" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">{children}</main>
    </div>
  );
}
