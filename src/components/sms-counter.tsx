"use client";

import { useState } from "react";
import { analyzeSms } from "@/lib/sms/segments";

/**
 * Message textarea with a live estimate: characters, encoding, segments and a fill meter.
 * The server's quote (Check cost) is the figure that matters for billing.
 */
export function SmsComposer({ name = "body", defaultValue = "" }: { name?: string; defaultValue?: string }) {
  const [text, setText] = useState(defaultValue);
  const a = analyzeSms(`[Tutera-X] ${text}`);
  const capacity = a.segments <= 1 ? a.singleLimit : a.segments * a.multiLimit;
  const fill = Math.min(100, (a.units / Math.max(1, capacity)) * 100);
  const gsm = a.encoding === "gsm7";

  return (
    <div className="space-y-3">
      <textarea
        name={name}
        required
        maxLength={480}
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="textarea leading-relaxed"
        placeholder="Dear {name}, your message here…"
        aria-describedby="sms-counter"
      />
      <div id="sms-counter" className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div
            className={`h-full rounded-full transition-all duration-300 ${gsm ? "bar-brand" : "bar-warn"}`}
            style={{ width: `${fill}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600">
          <span>
            <strong className="font-semibold text-slate-900">{a.units}</strong> characters
          </span>
          <span>
            {gsm ? (
              <span className="font-semibold text-emerald-700">Standard message</span>
            ) : (
              <span className="font-semibold text-amber-700">Bangla or symbols cost more</span>
            )}
          </span>
          <span>
            <strong className="font-semibold text-slate-900">{a.segments}</strong> text part{a.segments === 1 ? "" : "s"} per message
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Use <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">{"{name}"}</code> to insert each student&apos;s name.
      </p>
    </div>
  );
}
