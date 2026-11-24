"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Field } from "./ui";

/**
 * "New batch" button that opens the create form in a centred popup. On phones the popup slides
 * up from the bottom. Closes on Escape, the close button, or a click outside the panel.
 * The form posts to the server action, so it still works if JavaScript is slow to load.
 */
export function NewBatchDialog({
  action,
  defaultOpen = false,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

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
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary gap-2" aria-haspopup="dialog">
        <Plus className="h-4 w-4" aria-hidden="true" />
        New batch
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="new-batch-title">
          <button type="button" aria-label="Close" className="tx-fade absolute inset-0 bg-slate-900/45" onClick={() => setOpen(false)} />

          <div className="tx-sheet relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="new-batch-title" className="text-lg font-bold text-slate-900">New batch</h2>
                <p className="mt-1 text-sm text-slate-500">Create a group, then add students to it.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <form action={action} className="grid gap-3">
              <Field label="Batch name" htmlFor="name">
                <input id="name" name="name" required maxLength={80} className="input" placeholder="Morning A" autoFocus />
              </Field>
              <Field label="Class" htmlFor="className">
                <input id="className" name="className" required maxLength={40} className="input" placeholder="Class 9" />
              </Field>
              <Field label="Subject (optional)" htmlFor="subject">
                <input id="subject" name="subject" maxLength={60} className="input" />
              </Field>
              <Field label="WhatsApp group link (optional)" htmlFor="whatsappLink" hint="Students in this batch will see a button to join the group.">
                <input id="whatsappLink" name="whatsappLink" type="text" inputMode="url" maxLength={200} className="input" placeholder="https://chat.whatsapp.com/…" />
              </Field>
              <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setOpen(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Create batch</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
