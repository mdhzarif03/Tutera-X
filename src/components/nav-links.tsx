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
}

// Icons are chosen by destination, here in the client component, because functions cannot cross
// from server to client components.
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

/** The most specific item that matches the URL is active, so "/teacher" never lights up with "/teacher/students". */
export function NavLinks({ items, variant }: { items: NavItem[]; variant: "sidebar" | "tabs" }) {
  const pathname = usePathname();
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const active = items
    .filter((i) => matches(i.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  if (variant === "tabs") {
    return (
      <nav aria-label="Primary" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3">
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

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.href] ?? Circle;
        const on = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={on ? "page" : undefined}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition duration-200 ${
              on ? "bg-white/12 text-white shadow-inner ring-1 ring-inset ring-white/10" : "text-indigo-100/75 hover:bg-white/8 hover:text-white"
            }`}
          >
            {on ? <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-amber-300" aria-hidden="true" /> : null}
            <Icon className={`h-[18px] w-[18px] transition ${on ? "text-amber-300" : "text-indigo-200/70 group-hover:text-white"}`} aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

