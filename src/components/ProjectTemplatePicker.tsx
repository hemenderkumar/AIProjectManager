"use client";
import { useEffect, useState } from "react";
import { LayoutTemplate, Rocket, Sparkles, Loader2, X, RotateCcw, ArrowLeft } from "lucide-react";

type TaskSkeletonItem = { title: string; phase: string | null; priority: string; estimateHours: number | null };
type Snapshot = {
  charter: { description: string | null; problemStatement: string | null; proposedSolution: string | null; expectedBenefits: string | null; program: string | null };
  taskSkeleton: TaskSkeletonItem[];
};
type Template = {
  id: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  snapshot: Snapshot;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";
const smallInputCls = "w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500";

// Shared with /templates — extracted so the "New Project" flow can offer the exact same
// browse/AI-tweak/instantiate experience inline, without duplicating the logic. `onCreated`
// hands back the new project's id instead of navigating directly, so callers can decide where
// to send the user; `onBack`, if given, renders a link back to whatever came before (e.g. the
// New Project flow's "template vs blank" choice step).
export default function ProjectTemplatePicker({ onCreated, onBack }: { onCreated: (projectId: string) => void; onBack?: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [instantiating, setInstantiating] = useState<string | null>(null);
  const [newName, setNewName] = useState<Record<string, string>>({});

  const [tweakOpen, setTweakOpen] = useState<Record<string, boolean>>({});
  const [tweakInstruction, setTweakInstruction] = useState<Record<string, string>>({});
  const [tweaking, setTweaking] = useState<string | null>(null);
  const [tweakError, setTweakError] = useState<Record<string, string | null>>({});
  const [preview, setPreview] = useState<Record<string, Snapshot | null>>({});

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setTemplates(Array.isArray(rows) ? rows : []))
      .finally(() => setLoading(false));
  }, []);

  async function previewTweak(t: Template) {
    const instruction = tweakInstruction[t.id]?.trim();
    if (!instruction) return;
    setTweaking(t.id);
    setTweakError((prev) => ({ ...prev, [t.id]: null }));
    try {
      const res = await fetch("/api/ai/template-tweak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: t.id, instruction }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTweakError((prev) => ({ ...prev, [t.id]: data?.error ?? "Couldn't apply that change." }));
        return;
      }
      setPreview((prev) => ({ ...prev, [t.id]: data.snapshot }));
    } finally {
      setTweaking(null);
    }
  }

  function discardTweak(id: string) {
    setPreview((prev) => ({ ...prev, [id]: null }));
    setTweakInstruction((prev) => ({ ...prev, [id]: "" }));
  }

  async function instantiate(t: Template) {
    const name = newName[t.id]?.trim();
    if (!name) return;
    setInstantiating(t.id);
    try {
      const snapshotOverride = preview[t.id];
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "instantiate", templateId: t.id, newProjectName: name, snapshot: snapshotOverride ?? undefined }),
      });
      const created = await res.json();
      if (res.ok && created?.id) onCreated(created.id);
    } finally {
      setInstantiating(null);
    }
  }

  return (
    <div className="space-y-4">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700">
          <ArrowLeft size={13} /> Back
        </button>
      )}
      {loading ? (
        <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-10 text-center">
          <LayoutTemplate size={28} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No templates yet. Open any project and use &ldquo;Save as Template&rdquo; to create one.</p>
          {onBack && (
            <button onClick={onBack} className="mt-3 text-xs font-medium text-accent-600 hover:text-accent-700">
              Start from scratch instead
            </button>
          )}
        </div>
      ) : (
        templates.map((t) => {
          const activeSnapshot = preview[t.id] ?? t.snapshot;
          const isTweaked = !!preview[t.id];
          return (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                  {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    {(activeSnapshot?.taskSkeleton?.length ?? 0)} task{(activeSnapshot?.taskSkeleton?.length ?? 0) === 1 ? "" : "s"} · saved by {t.createdBy ?? "someone"}
                    {isTweaked && <span className="text-accent-600 font-medium"> · tweaked with AI</span>}
                  </p>
                </div>
                <button
                  onClick={() => setTweakOpen((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <Sparkles size={13} /> Customize with AI
                </button>
              </div>

              {tweakOpen[t.id] && (
                <div className="mt-3 border border-accent-100 bg-accent-50/60 rounded-lg p-3 space-y-2">
                  <textarea
                    value={tweakInstruction[t.id] ?? ""}
                    onChange={(e) => setTweakInstruction((prev) => ({ ...prev, [t.id]: e.target.value }))}
                    className={smallInputCls}
                    rows={2}
                    placeholder="e.g. drop the UAT phase, add a security review task, and mention this is for the EU market"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => previewTweak(t)}
                      disabled={tweaking === t.id || !tweakInstruction[t.id]?.trim()}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 disabled:opacity-50 font-medium"
                    >
                      {tweaking === t.id ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      {tweaking === t.id ? "Applying…" : "Preview changes"}
                    </button>
                    {isTweaked && (
                      <button
                        onClick={() => discardTweak(t.id)}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                      >
                        <RotateCcw size={12} /> Revert to original
                      </button>
                    )}
                  </div>
                  {tweakError[t.id] && <p className="text-xs text-rose-600">{tweakError[t.id]}</p>}

                  {isTweaked && (
                    <div className="bg-white border border-slate-200 rounded-lg p-3 mt-2">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-slate-700">Preview — this is what will be created</p>
                        <button onClick={() => discardTweak(t.id)} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
                      </div>
                      {activeSnapshot.charter?.description && (
                        <p className="text-xs text-slate-600 mb-2">{activeSnapshot.charter.description}</p>
                      )}
                      <ul className="space-y-1">
                        {activeSnapshot.taskSkeleton.map((task, i) => (
                          <li key={i} className="text-xs text-slate-600 flex items-center gap-2">
                            <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                            <span className="flex-1">{task.title}</span>
                            {task.phase && <span className="text-slate-400">{task.phase}</span>}
                            <span className="text-slate-400">{task.priority}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <input
                  className={inputCls}
                  placeholder="New project name"
                  value={newName[t.id] ?? ""}
                  onChange={(e) => setNewName((prev) => ({ ...prev, [t.id]: e.target.value }))}
                />
                <button
                  onClick={() => instantiate(t)}
                  disabled={instantiating === t.id || !newName[t.id]?.trim()}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
                >
                  <Rocket size={13} /> {instantiating === t.id ? "Creating…" : isTweaked ? "Create tweaked project" : "Use template"}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
