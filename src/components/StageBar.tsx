"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { STAGE_LABELS, STAGES } from "@/lib/kpi";

// Recharts writes `fill` straight onto the SVG <rect> as a presentation attribute. Passing a
// literal `var(--accent-600)` string there rendered invisible bars in production -- Recharts'
// own re-render cycle doesn't reliably re-resolve CSS custom properties through that path, so
// the fill attribute was effectively empty. Resolving the variable to a concrete color via
// getComputedStyle (and re-resolving on theme change, since --accent-600 is redefined per
// [data-theme]) sidesteps that entirely and keeps the bar theme-aware.
function useAccentColor(fallback: string = "#4f46e5"): string {
  const [color, setColor] = useState(fallback);
  useEffect(() => {
    function resolve() {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--accent-600").trim();
      if (value) setColor(value);
    }
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return color;
}

export default function StageBar({ byStage }: { byStage: Record<string, number> }) {
  const accent = useAccentColor();
  const data = STAGES.map((s) => ({ stage: STAGE_LABELS[s], count: byStage[s] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" fill={accent} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
