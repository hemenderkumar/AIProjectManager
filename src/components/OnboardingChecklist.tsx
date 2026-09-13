"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X, Rocket } from "lucide-react";
import type { OnboardingItem } from "@/lib/onboarding";

// Rendered only when there's something left to do -- see the !allComplete check in
// home/page.tsx -- so this never nags once every item is checked off. Dismissing is the other
// way it disappears: persisted server-side via users.onboardingDismissedAt (see
// /api/me/onboarding-dismiss), same "saved to the account, not the browser" reasoning as
// ThemeSwitcher, so it stays dismissed on any device this person logs into next.
export default function OnboardingChecklist({ items }: { items: OnboardingItem[] }) {
  const [dismissed, setDismissed] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  if (dismissed) return null;

  const doneCount = items.filter((i) => i.completed).length;

  async function dismiss() {
    setDismissing(true);
    setDismissed(true); // optimistic -- a failed request just means it reappears next visit
    await fetch("/api/me/onboarding-dismiss", { method: "POST" }).catch(() => {});
    setDismissing(false);
  }

  return (
    <div className="panel-glow card-accent-edge rounded-xl px-5 py-4 mb-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Rocket size={15} className="text-accent-600" />
          <p className="text-xs font-semibold text-accent-900 uppercase tracking-wide">Getting Started</p>
        </div>
        <button
          onClick={dismiss}
          disabled={dismissing}
          aria-label="Dismiss getting started checklist"
          className="text-slate-300 hover:text-slate-500 transition-colors"
        >
          <X size={15} />
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">{doneCount} of {items.length} complete</p>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.key} className="flex items-start gap-2.5">
            {item.completed ? (
              <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            ) : (
              <Circle size={16} className="text-slate-300 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${item.completed ? "text-slate-400 line-through" : "text-slate-900"}`}>
                {item.label}
              </p>
              {!item.completed && (
                <>
                  <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{item.description}</p>
                  <Link href={item.href} className="inline-block text-xs font-medium text-accent-600 hover:text-accent-700 mt-1">
                    {item.ctaLabel} →
                  </Link>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
