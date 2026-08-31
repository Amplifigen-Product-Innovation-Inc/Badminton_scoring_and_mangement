"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "badminton-theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

function readStoredTheme(): Theme {
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back to system.
    return "system";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/**
 * §50 — light/dark/system for admin. The tokens in globals.css were
 * already structured for this (a `data-theme` override alongside the
 * `prefers-color-scheme` media query); this just flips the attribute and
 * remembers the choice per browser.
 *
 * Reads the stored preference via useSyncExternalStore rather than
 * useState+useEffect — localStorage isn't available during the server
 * render, and this avoids both a setState-in-effect and a hydration
 * mismatch on the highlighted button.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, () => "system" as Theme);

  // Re-apply on mount too, in case a previous page load already set a
  // choice that this fresh document hasn't reflected in its data-theme yet.
  useEffect(() => {
    apply(theme);
  }, [theme]);

  function choose(next: Theme) {
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort only — the choice still applies for this page view.
    }
    // useSyncExternalStore only re-reads on a "storage" event, which the
    // browser doesn't fire for writes made from this same tab — dispatch
    // one so this toggle's own click updates its highlighted state.
    window.dispatchEvent(new StorageEvent("storage"));
  }

  return (
    <div className="inline-flex gap-1 rounded-lg border border-surface-border p-1">
      {(["light", "system", "dark"] as const).map((t) => (
        <Button
          key={t}
          size="sm"
          variant={theme === t ? "primary" : "ghost"}
          onClick={() => choose(t)}
          className="capitalize"
        >
          {t}
        </Button>
      ))}
    </div>
  );
}
