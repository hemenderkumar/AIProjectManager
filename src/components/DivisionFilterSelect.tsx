"use client";

// Thin, reusable <select> used identically on /projects, /ideation, and /demand -- kept as
// one component so all three read the same way and a future style tweak isn't a 3x edit.
export default function DivisionFilterSelect({
  value,
  onChange,
  divisions,
}: {
  value: string;
  onChange: (value: string) => void;
  divisions: { id: string; name: string }[];
}) {
  if (divisions.length === 0) return null;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5"
    >
      <option value="ALL">All divisions</option>
      {divisions.map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </select>
  );
}
