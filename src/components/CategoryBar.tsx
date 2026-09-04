"use client";
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";

// Generic sibling of StageBar -- that component is hardcoded to project stages (STAGES/
// STAGE_LABELS from lib/kpi.ts), so it can't be reused for a demand-status or
// ideation-sub-stage breakdown without either bending its API or duplicating the
// accent-color-resolution logic. This takes plain {label, count} pairs instead, in whatever
// order the caller wants (StageBar orders by protocol; the caller here is responsible for
// ordering the categories meaningfully -- e.g. backlog progression order, not alphabetical).
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

export default function CategoryBar({ data }: { data: { label: string; count: number }[] }) {
  const accent = useAccentColor();
  if (data.every((d) => d.count === 0)) {
    return <p className="text-sm text-slate-400 flex items-center justify-center h-full">Nothing to show yet</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" fill={accent} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
