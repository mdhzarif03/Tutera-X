"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * On phones, tables are drawn as stacked cards (see globals.css). Each cell then needs its column
 * name beside the value. This copies each header's text onto the cells below it as `data-label`.
 * It changes only an attribute that the desktop layout ignores. Renders nothing.
 */
export function TableLabels() {
  const pathname = usePathname();

  useEffect(() => {
    const label = () => {
      document.querySelectorAll<HTMLTableElement>("table.tbl").forEach((table) => {
        const heads = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
        if (heads.length === 0) return;
        // A header that holds only screen-reader text (such as "Actions") has nothing to show.
        const names = heads.map((th) => (th.querySelector(".sr-only") ? "" : (th.textContent ?? "").replace(/\s+/g, " ").trim()));
        table.querySelectorAll<HTMLTableRowElement>("tbody tr").forEach((row) => {
          const cells = Array.from(row.children).filter((c): c is HTMLTableCellElement => c instanceof HTMLTableCellElement);
          if (cells.length !== names.length) return;
          cells.forEach((cell, i) => {
            const name = names[i];
            if (name && cell.dataset.label !== name) cell.dataset.label = name;
          });
        });
      });
    };

    label();
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(label);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
