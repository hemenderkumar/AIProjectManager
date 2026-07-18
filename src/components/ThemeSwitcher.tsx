"use client";
import { useState } from "react";
import { Check } from "lucide-react";

// Each entry's `id` doubles as the data-theme value applied to <html> and as the CSS selector
// in globals.css ([data-theme="..."] overriding --accent-*). Adding a 7th theme is: one entry
// here, one matching block in globals.css — no component needs to know the actual colors.
const THEMES = [
  { id: "indigo", label: "Indigo" },
  { id: "nautical", label: "Nautical" },
  { id: "ocean", label: "Ocean" },
  { id: "chart", label: "Chart" },
  { id: "compass", label: "Compass" },
  { id: "coral", label: "Coral" },
] as const;

const THEME_KEY = "keel.theme";

export default function ThemeSwitcher() {
  // Lazy initializer instead of an effect: reads the same localStorage key the inline
  // anti-flash script in the root layout already applied to <html> before paint, so this
  // control's selected state matches what's on screen from the very first render — no
  // separate mount effect needed, and nothing to flicker between "indigo" and the real value.
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window === "undefined") return "indigo";
    return window.localStorage.getItem(THEME_KEY) ?? "indigo";
  });

  function applyTheme(id: string) {
    setTheme(id);
    window.localStorage.setItem(THEME_KEY, id);
    document.documentElement.setAttribute("data-theme", id);
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
