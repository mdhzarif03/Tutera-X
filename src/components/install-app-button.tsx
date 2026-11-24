"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Shared install logic. Chrome, Edge and Android Chrome offer a real install prompt, which
 * installs Tutera-X as its own window with no browser bars. iPhone and iPad have no prompt, so
 * the UI explains the Share > Add to Home Screen steps instead. `installed` hides every entry point.
 */
export function useInstallApp() {
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setReady(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function prompt() {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === "accepted") setInstalled(true);
    return outcome === "accepted";
  }

  const instructions = ios
    ? "Tap the Share button in Safari, then choose Add to Home Screen. Tutera-X will open full screen like an app."
    : "Open your browser menu and choose Install app or Add to Home screen.";

  return { ready, installed, canPrompt: deferred !== null, prompt, instructions };
}

/** A row for the profile dropdown. Sits above Settings. */
export function InstallMenuItem({ onDone }: { onDone?: () => void }) {
  const { ready, installed, canPrompt, prompt, instructions } = useInstallApp();
  const [help, setHelp] = useState(false);
  if (!ready || installed) return null;

  // Desktop only: on phones the header avatar also opens this menu, and there the entry lives in More.
  return (
    <div className="hidden md:block">
      <button
        type="button"
        role="menuitem"
        onClick={async () => {
          if (canPrompt) {
            await prompt();
            onDone?.();
          } else {
            setHelp((v) => !v);
          }
        }}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
      >
        <Download className="h-4 w-4 text-slate-400" aria-hidden="true" />
        Install app
      </button>
      {help ? <p className="px-3 pb-2 text-xs leading-relaxed text-slate-500">{instructions}</p> : null}
    </div>
  );
}
