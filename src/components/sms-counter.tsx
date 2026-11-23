"use client";

import { useState } from "react";
import { analyzeSms } from "@/lib/sms/segments";

/** Message textarea with a live segment count. The count is an estimate; the server's figure is billed. */
export function SmsComposer({ name = "body", defaultValue = "" }: { name?: string; defaultValue?: string }) {
  const [text, setText] = useState(defaultValue);
  const withPrefix = `[Tutera-X] ${text}`;
  const a = analyzeSms(withPrefix);
  const remaining = a.encoding === "gsm7" ? (a.segments <= 1 ? a.singleLimit - a.units : a.segments * a.multiLimit - a.units) : null;
  return (
    <div>
      <textarea
        name={name}
        required
        maxLength={480}
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="textarea"
        placeholder="Dear {name}, your Bangla or English message here."
        aria-describedby="sms-counter"
      />
      <div id="sms-counter" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span>
          <strong className="font-semibold text-slate-900">{a.units}</strong> characters (including the Tutera-X prefix)
        </span>
        <span>
          Encoding: <strong className="font-semibold text-slate-900">{a.encoding === "gsm7" ? "GSM-7 (standard)" : "UCS-2 (Bangla or symbols, about 3x cost)"}</strong>
        </span>
        <span>
          <strong className="font-semibold text-slate-900">{a.segments}</strong> segment{a.segments === 1 ? "" : "s"} per message
        </span>
        {remaining !== null && a.segments > 0 ? <span>{remaining} left in this segment</span> : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">Use {"{name}"} to insert each student's name. Keep messages in plain English where possible.</p>
    </div>
  );
}
