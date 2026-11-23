import type { ReactNode } from "react";
import { logoutAction } from "@/actions/auth";
import { NavLinks, type NavItem } from "./nav-links";

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
  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 px-4 py-5 md:sticky md:top-0 md:flex md:h-dvh">
        <div className="mb-6 px-2">
          <p className="text-lg font-semibold tracking-tight text-white">Tutera-X</p>
          <p className="text-xs text-slate-400">{roleLabel}</p>
        </div>
        <NavLinks items={nav} variant="sidebar" />
        <div className="mt-auto border-t border-white/10 pt-4">
          <p className="truncate px-2 text-sm text-slate-200">{userName}</p>
          <form action={logoutAction} className="mt-2">
            <button type="submit" className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-400 hover:bg-white/5 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 pt-3 backdrop-blur md:hidden">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-slate-900">Tutera-X</p>
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-slate-600 underline-offset-2 hover:underline">
                Sign out
              </button>
            </form>
          </div>
          <div className="mt-2">
            <NavLinks items={nav} variant="tabs" />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
