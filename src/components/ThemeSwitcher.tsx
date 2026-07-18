"use client";
import { useState } from "react";
import { Check } from "lucide-react";

// Each entry's `id` doubles as the data-theme value applied to <html> and as the CSS selector
// in globals.css ([data-theme="..."] overriding --accent-*). Adding a 7th theme is: one entry
// here, one matching block in globals.css, and one entry in VALID_THEMES in lib/auth.ts.
const THEMES = [
  { id: "indigo", label: "Indigo" },
  { id: "nautical", label: "Nautical" },
  { id: "ocean", label: "Ocean" },
  { id: "chart", label: "Chart" },
  { id: "compass", label: "Compass" },
  { id: "coral", label: "Coral" },
] as const;

export default function ThemeSwitcher() {
  // The root layout already rendered the account's saved theme onto <html data-theme="..."> in
  // the initial server response (see getCurrentTheme() in lib/auth.ts) — reading it back off
  // the DOM here just mirrors that into this control's own state, with nothing to flicker
  // between a placeholder and the real value.
  const [theme, setTheme] = useState<string>(() => {
    if (typeof document === "undefined") return "indigo";
    return document.documentElement.getAttribute("data-theme") ?? "indigo";
  });

  function applyTheme(id: string) {
    setTheme(id);
    document.documentElement.setAttribute("data-theme", id);
    // Best-effort — the UI has already switched instantly either way. Saved against the
    // account (not the browser) so it's the same the next time they log in from anywhere.
    fetch("/api/me/theme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: id }),
    }).catch(() => {});
  }

  return (
    <div>
      <p className="px-1 pb-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Theme</p>
      <div className="flex items-center gap-1.5 px-1">
        {THEMES.map((t) => (
          <button
            key={t.id}
            data-theme={t.id}
            onClick={() => applyTheme(t.id)}
            title={t.label}
            aria-label={`${t.label} theme`}
            aria-pressed={theme === t.id}
            className="relative h-5 w-5 rounded-full bg-accent-600 shrink-0 hover:scale-110 transition-transform"
          >
            {theme === t.id && (
              <Check size={11} strokeWidth={3} className="absolute inset-0 m-auto text-white" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
