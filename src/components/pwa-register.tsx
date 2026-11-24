"use client";

import { useEffect } from "react";

// Registers the service worker in production builds only, so local development never serves
// stale cached code. Registration failures are ignored: the app works fine without it.
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
