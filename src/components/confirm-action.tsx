import { Trash2 } from "lucide-react";

// A two-step confirmation that works without JavaScript. The question opens in place, inside the
// page flow, so it can never be clipped by a table or pushed off-screen.
export function ConfirmAction({
  action,
  hidden,
  label,
  question,
  confirmLabel,
  tone = "danger",
}: {
  action: (formData: FormData) => Promise<void>;
  hidden: Record<string, string>;
  label: string;
  question: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
}) {
  const primary = tone === "primary";
  return (
    <details className="group inline-block max-w-full text-left align-top">
      <summary className={`${primary ? "btn btn-primary" : "btn btn-danger"} btn-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
        {primary ? null : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
        {label}
      </summary>
      <div className={`mt-3 w-80 max-w-full rounded-xl border p-4 text-left ${primary ? "border-teal-200 bg-teal-50/70" : "border-rose-200 bg-rose-50/70"}`}>
        <p className="text-sm leading-relaxed text-slate-700">{question}</p>
        <form action={action} className="mt-3 flex flex-wrap items-center gap-2.5">
          {Object.entries(hidden).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <button type="submit" className={`btn btn-sm ${primary ? "btn-primary" : "btn-danger bg-rose-600 text-white ring-0 hover:bg-rose-700"}`}>
            {confirmLabel}
          </button>
          <span className="text-xs text-slate-500">Press the first button again to cancel.</span>
        </form>
      </div>
    </details>
  );
}
