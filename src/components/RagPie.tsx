"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const COLORS: Record<string, string> = { GREEN: "#10b981", YELLOW: "#f59e0b", RED: "#f43f5e" };

export default function RagPie({ byRag }: { byRag: Record<string, number> }) {
  const data = Object.entries(byRag)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k, value: v }));

  if (data.length === 0) {
    return <p className="text-sm text-slate-400 flex items-center justify-center h-full">No active projects</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={COLORS[entry.name] ?? "#94a3b8"} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
