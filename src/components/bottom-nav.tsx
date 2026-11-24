"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutGrid, LogOut, Settings, User, X } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { navIcon, type NavItem } from "./nav-links";

const PRIMARY_SLOTS = 4;

/**
 * Phone navigation: a tab bar fixed to the bottom of the screen, like a social app.
 * The first four destinations get a tab. Everything else, plus the account, opens from the last tab.
 * Hidden from the md breakpoint up, where the top navigation is used instead.
 */
export function BottomNav({
  items,
  name,
  roleLabel,
  initials,
  settingsHref,
  settingsLabel,
}: {
  items: NavItem[];
  name: string;
  roleLabel: string;
  initials: string;
  settingsHref: string;
  settingsLabel: string;
}) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);

  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const active = items.filter((i) => matches(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const primary = items.slice(0, PRIMARY_SLOTS);
  const overflow = items.slice(PRIMARY_SLOTS);
  const moreActive = open || (active !== undefined && overflow.some((i) => i.href === active)) || matches(settingsHref);
  const MoreIcon = overflow.length > 0 ? LayoutGrid : User;

  // Close the sheet whenever the page changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While the sheet is open: Escape closes it, and the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      >
        <ul className="grid auto-cols-fr grid-flow-col">
          {primary.map((item) => {
            const Icon = navIcon(item.href);
            const on = item.href === active && !open;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  className="tab-item"
                  data-active={on ? "true" : undefined}
                >
                  <span className="tab-pill">
                    <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
                  </span>
                  <span className="tab-label">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="tab-item w-full"
              data-active={moreActive ? "true" : undefined}
            >
              <span className="tab-pill">
                <MoreIcon className="h-[22px] w-[22px]" aria-hidden="true" />
              </span>
              <span className="tab-label">{overflow.length > 0 ? "More" : "Me"}</span>
            </button>
          </li>
        </ul>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="More">
          <button type="button" aria-label="Close menu" className="tx-fade absolute inset-0 bg-slate-900/45" onClick={() => setOpen(false)} />
          <div className="tx-sheet absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
            <div className="flex items-center gap-3 pb-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-base font-bold text-indigo-950 grad-spark" aria-hidden="true">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-slate-900">{name}</p>
                <p className="text-xs text-slate-500">{roleLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {overflow.length > 0 ? (
              <ul className="grid grid-cols-3 gap-3 pb-4">
                {overflow.map((item) => {
                  const Icon = navIcon(item.href);
                  const on = item.href === active;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={on ? "page" : undefined}
                        className={`flex h-full flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-xs font-semibold ring-1 ring-inset transition active:scale-95 ${
                          on ? "bg-indigo-50 text-indigo-700 ring-indigo-200" : "bg-slate-50 text-slate-700 ring-slate-200"
                        }`}
                      >
                        <Icon className={`h-6 w-6 ${on ? "text-indigo-600" : "text-slate-500"}`} aria-hidden="true" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <Link
                href={settingsHref}
                className="flex min-h-12 items-center gap-3 rounded-2xl bg-slate-50 px-4 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-200 active:scale-[0.99]"
              >
                <Settings className="h-5 w-5 text-slate-500" aria-hidden="true" />
                {settingsLabel}
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl bg-rose-50 px-4 text-left text-sm font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 active:scale-[0.99]"
                >
                  <LogOut className="h-5 w-5" aria-hidden="true" />
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
