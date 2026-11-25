"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { SelectDropdown } from "./select-dropdown";

/**
 * A single-choice control (such as Sort) that writes its value into the URL.
 * It keeps every other search and filter in the URL, and uses the app's own dropdown styling.
 */
export function QuerySelect({
  paramKey,
  label,
  value,
  options,
  defaultValue,
}: {
  paramKey: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  defaultValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next === defaultValue) sp.delete(paramKey);
    else sp.set(paramKey, next);
    const qs = sp.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div className={`flex items-center gap-2 transition ${pending ? "opacity-70" : ""}`}>
      <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <div className="w-56 max-w-[calc(100vw-9rem)]">
        <SelectDropdown
          id={`query-${paramKey}`}
          name={paramKey}
          value={value}
          options={options}
          onChange={change}
        />
      </div>
    </div>
  );
}
