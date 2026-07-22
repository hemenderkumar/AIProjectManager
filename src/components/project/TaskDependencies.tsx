"use client";
import { useEffect, useState } from "react";
import { GitBranch, X, Loader2 } from "lucide-react";

type DepTask = { depId: string; id: string; title: string; status: string; dueDate: string | null };
type TaskOption = { id: string; title: string };

// In-context "blocked by / blocks" panel (#264), same collapsed-until-clicked pattern as
// AiEditChat/TaskComments. "Blocks" is read-only here -- removing that edge means going to the
// other task's own panel, since it's *that* task's dependsOn list that actually owns the edge.
export default function TaskDependencies({
  projectId,
  taskId,
  otherTasks,
}: {
  projectId: string;
  taskId: string;
  otherTasks: TaskOption[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dependsOn, setDependsOn] = useState<DepTask[]>([]);
  const [blocks, setBlocks] = useState<DepTask[]>([]);
  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/dependencies`);
      if (res.ok) {
        const data = await res.json();
        setDependsOn(data.dependsOn ?? []);
        setBlocks(data.blocks ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function addDependency() {
    if (!selected) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/dependencies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependsOnTaskId: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't add that dependency.");
        return;
      }
      setSelected("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function removeDependency(depId: string) {
    setRemovingId(depId);
    try {
      await fetch(`/api/projects/${projectId}/tasks/${taskId}/dependencies/${depId}`, { method: "DELETE" });
      setDependsOn((prev) => prev.filter((d) => d.depId !== depId));
    } finally {
      setRemovingId(null);
    }
  }

  const availableOptions = otherTasks.filter(
    (t) => t.id !== taskId && !dependsOn.some((d) => d.id === t.id)
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-accent-600"
      >
        <GitBranch size={12} /> Dependencies{dependsOn.length > 0 ? ` (${dependsOn.length})` : ""}
      </button>
    );
  }

  return (
    <div className="border border-slate-200 bg-slate-50/60 rounded-lg p-3 space-y-2 max-w-md">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700 flex items-center gap-1">
          <GitBranch size={12} /> Dependencies
        </p>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs">
          Close
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400">Loading...</p>
      ) : (
        <>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Blocked by</p>
            {dependsOn.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing yet.</p>
            ) : (
              <div className="space-y-1">
                {dependsOn.map((d) => (
                  <div key={d.depId} className="flex items-center justify-between text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                    <span className={d.status === "DONE" ? "text-slate-400 line-through" : "text-slate-700"}>{d.title}</span>
                    <button
                      onClick={() => removeDependency(d.depId)}
                      disabled={removingId === d.depId}
                      className="text-slate-400 hover:text-rose-600 disabled:opacity-50"
                    >
                      {removingId === d.depId ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {blocks.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">Blocks</p>
              <div className="space-y-1">
                {blocks.map((b) => (
                  <div key={b.depId} className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600">
                    {b.title}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-600">{error}</p>}

          {availableOptions.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">Add a dependency...</option>
                {availableOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
              <button
                onClick={addDependency}
                disabled={adding || !selected}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-accent-600 text-white disabled:opacity-50 font-medium shrink-0"
              >
                {adding ? "Adding..." : "Add"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
