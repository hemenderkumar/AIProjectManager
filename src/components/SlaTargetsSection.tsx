"use client";
import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { SLA_SEVERITIES, slaTargetMinutes, sanitizeSlaOverrides } from "@/lib/incidentSla";

type Grid = Record<string, { ack: string; resolve: string }>;
const inputCls = "w-24 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500";
const hrs = (min: number) => String(Math.round((min / 60) * 100) / 100);

export default function SlaTargetsSection() {
  const [grid, setGrid] = useState<Grid>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/organization")
      .then((r) => (r.ok ? r.json() : null))
      .then((org) => {
        const o = sanitizeSlaOverrides(org?.slaTargets);
        const g: Grid = {};
        for (const sev of SLA_SEVERITIES) {
          g[sev] = { ack: o[sev]?.ack != null ? hrs(o[sev]!.ack!) : "", resolve: o[sev]?.resolve != null ? hrs(o[sev]!.resolve!) : "" };
        }
        setGrid(g);
        setLoaded(true);
      });
  }, []);

  async function save(clear = false) {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slaTargets: clear ? null : grid }),
    });
    setSaving(false);
    if (!res.ok) {
      setMsg({ ok: false, text: (await res.json().catch(() => ({}))).error ?? "Could not save." });
      return;
    }
    if (clear) setGrid(Object.fromEntries(SLA_SEVERITIES.map((s) => [s, { ack: "", resolve: "" }])));
    setMsg({ ok: true, text: clear ? "Reset to defaults." : "Saved." });
  }

  if (!loaded) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
      <p className="text-sm font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
        <Timer size={15} className="text-accent-600" /> Incident SLA targets
      </p>
      <p className="text-xs text-slate-500 mb-4">
        How fast incidents on your projects must be acknowledged and resolved, in hours. Leave a field blank to use
        the default (shown as a placeholder). Early warnings and auto-escalation use these numbers.
      </p>
      <table className="text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pr-4 py-1 font-medium">Severity</th>
            <th className="pr-4 py-1 font-medium">Acknowledge within (h)</th>
            <th className="py-1 font-medium">Resolve within (h)</th>
          </tr>
        </thead>
        <tbody>
          {SLA_SEVERITIES.map((sev) => {
            const d = slaTargetMinutes(sev);
            return (
              <tr key={sev}>
                <td className="pr-4 py-1.5 text-slate-700 font-medium">{sev}</td>
                {(["ack", "resolve"] as const).map((k) => (
                  <td key={k} className="pr-4 py-1.5">
                    <input
                      inputMode="decimal"
                      className={inputCls}
                      placeholder={hrs(d[k])}
                      value={grid[sev]?.[k] ?? ""}
                      onChange={(e) => setGrid((g) => ({ ...g, [sev]: { ...g[sev], [k]: e.target.value } }))}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-3 mt-4">
        <button onClick={() => save()} disabled={saving} className="px-3.5 py-2 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-700 disabled:opacity-50">
          {saving ? "Saving..." : "Save SLA targets"}
        </button>
        <button onClick={() => save(true)} disabled={saving} className="text-xs text-slate-500 hover:text-rose-600">Reset to defaults</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
