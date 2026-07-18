"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { Plus, Trash2, RefreshCw, Loader2 } from "lucide-react";
import TeamAccessCard from "./TeamAccessCard";

type Resource = { id: string; name: string; role: string | null };

export default function ResourcesTab({
  detail,
  allResources,
  isInternal = true,
}: {
  detail: ProjectDetail;
  allResources: Resource[];
  isInternal?: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [allocation, setAllocation] = useState(50);

  const allocatedIds = new Set(detail.resources.map((r) => r.resourceId));
  const available = allResources.filter((r) => !allocatedIds.has(r.id));

  async function addAllocation() {
    if (!resourceId) return;
    setSaving(true);
    await fetch(`/api/projects/${detail.project.id}/resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceId, allocationPercent: allocation }),
    });
    setSaving(false);
    setShowForm(false);
    setResourceId("");
    router.refresh();
  }

  async function removeAllocation(allocationId: string) {
    await fetch(`/api/projects/${detail.project.id}/resources/${allocationId}`, { method: "DELETE" });
    router.refresh();
  }

  async function recalculate() {
    setRecalculating(true);
    await fetch(`/api/projects/${detail.project.id}/resources/recalculate`, { method: "POST" });
    setRecalculating(false);
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card
        title={`Allocated Resources (${detail.resources.length})`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={recalculate}
              disabled={recalculating}
              title="Recompute allocation % from each resource's currently assigned task hours"
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {recalculating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Recalculate from tasks
            </button>
            {isInternal && (
              <button
                onClick={() => setShowForm((s) => !s)}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100"
              >
                <Plus size={14} /> Allocate Resource
              </button>
            )}
          </div>
        }
      >
        <p className="text-xs text-slate-400 mb-3">
          Allocation % is kept in sync with each person&apos;s actual assigned task effort versus their
          weekly capacity and the project timeline — it updates automatically whenever the AI planner
          creates tasks or a task&apos;s assignee/hours change. Use &quot;Recalculate from tasks&quot; if
          numbers look stale, or set a manual figure below for someone not yet assigned tasks.
        </p>
        {!isInternal && (
          <p className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 mb-3">
            Staffing is managed by your Keel team — reach out to them to adjust who&apos;s allocated to this project.
          </p>
        )}
        {isInternal && showForm && (
          <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Resource">
                <select value={resourceId} onChange={(e) => setResourceId(e.target.value)} className={inputCls}>
                  <option value="">Select a resource...</option>
                  {available.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}{r.role ? ` — ${r.role}` : ""}</option>
                  ))}
                </select>
              </Field>
              <Field label="Allocation %">
                <input type="number" min={1} max={100} value={allocation} onChange={(e) => setAllocation(Number(e.target.value))} className={inputCls} />
              </Field>
            </div>
            <PrimaryButton onClick={addAllocation} disabled={saving}>{saving ? "Adding..." : "Add"}</PrimaryButton>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Role</th>
              <th className="py-2 font-medium">Allocation</th>
              <th className="py-2 font-medium">Weekly Capacity</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {detail.resources.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 last:border-0">
                <td className="py-2.5 font-medium text-slate-800">{r.name}</td>
                <td className="py-2.5 text-slate-600">{r.role ?? "—"}</td>
                <td className="py-2.5 text-slate-600">{r.allocationPercent}%</td>
                <td className="py-2.5 text-slate-600">{r.capacityHoursPerWk ?? "—"} hrs/wk</td>
                <td className="py-2.5 text-right">
                  <button onClick={() => removeAllocation(r.id)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {detail.resources.length === 0 && (
              <tr><td colSpan={5} className="py-6 text-center text-slate-400">No resources allocated yet.</td></tr>
            )}
          </tbody>
          </table>
        </div>
      </Card>

      <TeamAccessCard projectId={detail.project.id} />
    </div>
  );
}
