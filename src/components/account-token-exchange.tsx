"use client";

import { useEffect, useState } from "react";

/**
 * Reads the token from the URL fragment, removes it from the address bar at once, and trades it for
 * a page-scoped cookie with a POST. The token never appears in a path or a query string.
 */
export function AccountTokenExchange({ kind }: { kind: "activation" | "reset" }) {
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
        setMessage(data.error ?? "This link could not be opened.");
        setState("error");
      })
      .catch(() => {
        setMessage("Could not reach the server. Reload the page to try again.");
        setState("error");
      });
  }, [kind]);

  if (state === "checking") return <p className="text-sm text-slate-600" role="status">Checking your link…</p>;
  if (state === "missing") {
    return (
      <p className="text-sm text-slate-600">
        Open the link from your SMS. It contains the code needed to continue.
      </p>
    );
  }
  return (
    <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-900 ring-1 ring-inset ring-rose-200">
      {message}
    </p>
  );
}
