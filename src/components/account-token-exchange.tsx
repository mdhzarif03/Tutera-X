"use client";

import { useEffect, useState } from "react";

/**
 * Reads the token from the URL fragment, removes it from the address bar at once, and trades it for
 * a page-scoped cookie with a POST. The token never appears in a path or a query string.
 */
export function AccountTokenExchange({ kind }: { kind: "activation" }) {
  const [state, setState] = useState<"checking" | "missing" | "error">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = window.location.hash.replace(/^#/, "");
    if (!token) {
      setState("missing");
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);

    fetch("/api/account-tokens/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ kind, token }),
    })
      .then(async (res) => {
        if (res.ok) {
          window.location.replace(window.location.pathname);
          return;
        }
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setMessage(data.error ?? "This link couldn't be opened.");
        setState("error");
      })
      .catch(() => {
        setMessage("We couldn't connect. Please refresh and try again.");
        setState("error");
      });
  }, [kind]);

  const noscript = (
    <noscript>
      <p className="mb-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
        This link needs JavaScript. Turn it on in your browser settings, then open the link again.
      </p>
    </noscript>
  );

  if (state === "checking") {
    return (
      <>
        {noscript}
        <p className="text-sm text-slate-600" role="status">Checking your link…</p>
      </>
    );
  }
  if (state === "missing") {
    return (
      <>
        {noscript}
        <p className="text-sm text-slate-600">Open the link from your text message to continue.</p>
      </>
    );
  }
  return (
    <>
      {noscript}
      <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-inset ring-rose-200">
        {message}
      </p>
    </>
  );
}
