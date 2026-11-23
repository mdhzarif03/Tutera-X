import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { NavLinks, type NavItem } from "./nav-links";
import { Logo } from "./logo";

export function AppShell({
  roleLabel,
  userName,
  nav,
  children,
}: {
  roleLabel: string;
  userName: string;
  nav: NavItem[];
  children: ReactNode;
}) {
  const initials =
    userName
      .split(" ")
      .map((p) => p.charAt(0))
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "TX";

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sidebar hidden md:sticky md:top-0 md:flex md:h-dvh md:w-72 md:shrink-0 md:flex-col md:px-5 md:py-7">
        <Logo inverse className="px-1" />
        <p className="mt-4 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-200/70">{roleLabel}</p>

        <div className="mt-8 flex-1 overflow-y-auto">
          <NavLinks items={nav} variant="sidebar" />
        </div>

        <div className="mt-6 rounded-2xl bg-white/6 p-3.5 ring-1 ring-inset ring-white/10">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-indigo-950 grad-spark" aria-hidden="true">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{userName}</p>
              <p className="truncate text-xs text-indigo-200/70">{roleLabel}</p>
            </div>
          </div>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-indigo-100/80 transition hover:bg-white/10 hover:text-white"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 px-4 pt-3.5 backdrop-blur-xl md:hidden">
          <div className="flex items-center justify-between">
            <Logo />
            <form action={logoutAction}>
              <button type="submit" className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Sign out
              </button>
            </form>
          </div>
          <div className="mt-3">
            <NavLinks items={nav} variant="tabs" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
