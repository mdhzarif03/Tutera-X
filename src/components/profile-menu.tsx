"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { logoutAction } from "@/actions/auth";
import { InstallMenuItem } from "./install-app-button";

/**
 * The account button in the top bar. Opens a panel with the signed-in name, the settings link,
 * and sign out. Closes on an outside click or the Escape key.
 */
export function ProfileMenu({
  name,
  roleLabel,
  initials,
  settingsHref,
  settingsLabel,
}: {
  name: string;
  roleLabel: string;
  initials: string;
  settingsHref: string;
  settingsLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-2.5 rounded-xl py-1 pl-1 pr-2.5 transition duration-200 hover:bg-slate-100"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold text-indigo-950 grad-spark" aria-hidden="true">
          {initials}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-semibold text-slate-900">{name}</span>
          <span className="block text-xs text-slate-500">{roleLabel}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition duration-200 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="tx-pop absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl bg-white p-2 shadow-2xl shadow-slate-900/15 ring-1 ring-slate-200"
        >
          <div className="flex items-center gap-3 px-3 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-indigo-950 grad-spark" aria-hidden="true">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
              <p className="text-xs text-slate-500">{roleLabel}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-slate-100" />
          <InstallMenuItem onDone={() => setOpen(false)} />
          <Link
            role="menuitem"
            href={settingsHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <Settings className="h-4 w-4 text-slate-400" aria-hidden="true" />
            {settingsLabel}
          </Link>
          <div className="my-1 h-px bg-slate-100" />
          <form action={logoutAction}>
            <button
              role="menuitem"
              type="submit"
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-700 transition hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
