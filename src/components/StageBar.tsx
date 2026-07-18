"use client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { STAGE_LABELS, STAGES } from "@/lib/kpi";

export default function StageBar({ byStage }: { byStage: Record<string, number> }) {
  const data = STAGES.map((s) => ({ stage: STAGE_LABELS[s], count: byStage[s] ?? 0 }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="stage" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" fill="var(--accent-600)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
