"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarCheck,
  Circle,
  GraduationCap,
  Home,
  Layers,
  MessageSquare,
  Settings,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  /** Kept for compatibility. The top navigation does not group items. */
  section?: string;
}

// Icons are chosen by destination here, because functions cannot cross from server to client components.
const ICONS: Record<string, LucideIcon> = {
  "/teacher": Home,
  "/teacher/students": Users,
  "/teacher/batches": Layers,
  "/teacher/attendance": CalendarCheck,
  "/teacher/exams": GraduationCap,
  "/teacher/payments": Wallet,
  "/teacher/sms": MessageSquare,
  "/teacher/teachers": UserCog,
  "/teacher/settings": Settings,
  "/student": Home,
  "/student/attendance": CalendarCheck,
  "/student/exams": GraduationCap,
  "/student/payments": Wallet,
  "/student/profile": Users,
  "/parent": Home,
  "/parent/settings": Settings,
};

/** Icon for a destination. Shared with the mobile bottom navigation. */
export function navIcon(href: string): LucideIcon {
  return ICONS[href] ?? Circle;
}

/** The most specific item matching the URL is active, so "/teacher" never lights up with "/teacher/students". */
export function NavLinks({ items, variant }: { items: NavItem[]; variant: "top" | "tabs" }) {
  const pathname = usePathname();
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const active = items
    .filter((i) => matches(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  if (variant === "top") {
    return (
      <nav aria-label="Primary" className="no-scrollbar flex items-center gap-1 overflow-x-auto">
        {items.map((item) => {
          const Icon = ICONS[item.href] ?? Circle;
          const on = item.href === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition duration-200 ${
                on
                  ? "bg-indigo-50 text-indigo-700 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.18)]"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon className={`h-4 w-4 ${on ? "text-indigo-600" : "text-slate-400"}`} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  // Compact row for smaller windows, where the top navigation does not fit.
  return (
    <nav aria-label="Primary" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-3 sm:-mx-6 sm:px-6">
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? Circle;
        const on = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition duration-200 ${
              on ? "grad-brand text-white shadow-md shadow-indigo-600/25" : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
