import Link from "next/link";
import { Sparkles, AlertTriangle, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";
import type { Insight, InsightSeverity } from "@/lib/insights";

const SEVERITY_STYLE: Record<InsightSeverity, { icon: React.ReactNode; badge: string; tone: "bad" | "warn" | "good" }> = {
  critical: { icon: <AlertTriangle size={15} />, badge: "text-rose-600 bg-rose-50", tone: "bad" },
  warning: { icon: <AlertCircle size={15} />, badge: "text-amber-600 bg-amber-50", tone: "warn" },
  info: { icon: <CheckCircle2 size={15} />, badge: "text-emerald-600 bg-emerald-50", tone: "good" },
};

// The proactive surface of the AI PM -- unlike AvatarAssistant (which answers when asked),
// this renders unprompted on every dashboard load from lib/insights.ts's rule engine. Framed
// and iconed like an "AI" feature (Sparkles header, orb-adjacent gradient edge) even though the
// computation itself is deterministic, because from the user's point of view this IS the AI PM
// noticing something and saying so -- the mechanism underneath doesn't need to be a model call
// for that to be true, and keeping it rule-based means it's instant and free to render.
export default function AiInsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <div className="panel-glow card-accent-edge rounded-xl px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={15} className="text-accent-600" />
        <p className="text-xs font-semibold text-accent-900 uppercase tracking-wide">AI Insights</p>
      </div>
      <div className="space-y-3">
        {insights.map((insight) => {
          const style = SEVERITY_STYLE[insight.severity];
          return (
            <div key={insight.id} className="flex items-start gap-3">
              <span className={`shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${style.badge}`}>
                {style.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">{insight.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{insight.detail}</p>
                {insight.href && (
                  <Link
                    href={insight.href}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-700 mt-1"
                  >
                    {insight.hrefLabel ?? "View"} <ArrowRight size={11} />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
