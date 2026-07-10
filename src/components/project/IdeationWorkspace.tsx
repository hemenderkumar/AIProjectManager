"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Field, inputCls } from "./ui";
import { formatDateTime } from "@/lib/format";
import { Sparkles, Loader2, Plus, Trash2, CheckCircle2, Lightbulb, AlertTriangle } from "lucide-react";

const IDEATION_STATUS_LABELS: Record<string, string> = {
  EXPLORING: "Exploring",
  COMPARING_OPTIONS: "Comparing Options",
  READY_FOR_CHARTER: "Ready for Charter",
};

export default function IdeationWorkspace({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const p = detail.project;

  const [savingMeta, setSavingMeta] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [brainstorming, setBrainstorming] = useState(false);
  const [brainstormError, setBrainstormError] = useState<string | null>(null);

  const [generatingOptions, setGeneratingOptions] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [manualOption, setManualOption] = useState({ name: "", description: "", pros: "", cons: "" });
  const [showManualOption, setShowManualOption] = useState(false);

  async function updateMeta(key: "ideaType" | "ideationStatus", value: string) {
    setSavingMeta(true);
    await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    setSavingMeta(false);
    router.refresh();
  }

  async function addManualNote() {
    if (!manualNote.trim()) return;
    setAddingNote(true);
    await fetch(`/api/projects/${p.id}/brainstorm-entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: manualNote }),
    });
    setAddingNote(false);
    setManualNote("");
    router.refresh();
  }

  async function deleteNote(entryId: string) {
    await fetch(`/api/projects/${p.id}/brainstorm-entries/${entryId}`, { method: "DELETE" });
    router.refresh();
  }

  async function brainstormWithAi() {
    setBrainstorming(true);
    setBrainstormError(null);
    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBrainstormError(data.error ?? "Couldn't brainstorm right now.");
        return;
      }
      router.refresh();
    } finally {
      setBrainstorming(false);
    }
  }

  async function generateOptionsWithAi() {
    setGeneratingOptions(true);
    setOptionsError(null);
    try {
      const res = await fetch("/api/ai/solution-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOptionsError(data.error ?? "Couldn't generate options right now.");
        return;
      }
      router.refresh();
    } finally {
      setGeneratingOptions(false);
    }
  }

  async function addManualOption() {
    if (!manualOption.name.trim()) return;
    await fetch(`/api/projects/${p.id}/solution-options`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manualOption),
    });
    setManualOption({ name: "", description: "", pros: "", cons: "" });
    setShowManualOption(false);
    router.refresh();
  }

  async function selectOption(optionId: string) {
    await fetch(`/api/projects/${p.id}/solution-options/${optionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSelected: true }),
    });
    router.refresh();
  }

  async function removeOption(optionId: string) {
    await fetch(`/api/projects/${p.id}/solution-options/${optionId}`, { method: "DELETE" });
    router.refresh();
  }

  const isProblem = p.ideaType === "PROBLEM";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Idea type">
          <select
            value={p.ideaType ?? ""}
            onChange={(e) => updateMeta("ideaType", e.target.value)}
            disabled={savingMeta}
            className={inputCls}
          >
            <option value="" disabled>Select an idea type...</option>
            <option value="OPPORTUNITY">New Opportunity — proactive idea</option>
            <option value="PROBLEM">Problem to Solve — reactive, needs comparison</option>
          </select>
        </Field>
        <Field label="Ideation status">
          <select
            value={p.ideationStatus}
            onChange={(e) => updateMeta("ideationStatus", e.target.value)}
            disabled={savingMeta}
            className={inputCls}
          >
            {Object.entries(IDEATION_STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </Field>
      </div>
      {!p.ideaType && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
          <AlertTriangle size={12} /> Set an idea type — it shapes how AI brainstorming and the options
          comparison below work.
        </p>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold text-slate-700">Brainstorm log ({detail.brainstormEntries.length})</p>
          <button
            onClick={brainstormWithAi}
            disabled={brainstorming}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
          >
            {brainstorming ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Brainstorm with AI
          </button>
        </div>
        {brainstormError && <p className="text-xs text-rose-600 mb-2">{brainstormError}</p>}

        <div className="flex items-start gap-2 mb-3">
          <textarea
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            className={inputCls}
            rows={2}
            placeholder="Add a manual note from a discussion or meeting..."
          />
          <button
            onClick={addManualNote}
            disabled={addingNote || !manualNote.trim()}
            className="shrink-0 flex items-center gap-1 text-xs px-2.5 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus size={13} /> Add
          </button>
        </div>

        {detail.brainstormEntries.length === 0 ? (
          <p className="text-xs text-slate-400">No brainstorming logged yet — this idea is a blank page.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {detail.brainstormEntries.map((e) => (
              <div
                key={e.id}
                className={`rounded-lg p-3 text-xs border ${e.source === "AI" ? "bg-indigo-50/60 border-indigo-200" : "bg-slate-50 border-slate-200"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-semibold ${e.source === "AI" ? "text-indigo-900" : "text-slate-700"}`}>
                    {e.source === "AI" ? "AI" : e.author || "Note"} · {formatDateTime(e.createdAt)}
                  </span>
                  <button onClick={() => deleteNote(e.id)} className="text-slate-400 hover:text-rose-600">
                    <Trash2 size={12} />
                  </button>
                </div>
                <p className={`whitespace-pre-wrap ${e.source === "AI" ? "text-indigo-800" : "text-slate-600"}`}>
                  {e.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {isProblem && (
        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Lightbulb size={13} className="text-amber-500" /> Solution options ({detail.solutionOptions.length})
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowManualOption((s) => !s)}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Plus size={13} /> Add option
              </button>
              <button
                onClick={generateOptionsWithAi}
                disabled={generatingOptions}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
              >
                {generatingOptions ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                Generate options with AI
              </button>
            </div>
          </div>
          {optionsError && <p className="text-xs text-rose-600 mb-2">{optionsError}</p>}
          <p className="text-[11px] text-slate-400 mb-2">
            Compare a few genuinely different approaches before committing to the proposed solution above.
          </p>

          {showManualOption && (
            <div className="mb-3 p-3 bg-slate-50 rounded-lg space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Name">
                  <input value={manualOption.name} onChange={(e) => setManualOption((o) => ({ ...o, name: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Description">
                  <input value={manualOption.description} onChange={(e) => setManualOption((o) => ({ ...o, description: e.target.value }))} className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Pros">
                  <input value={manualOption.pros} onChange={(e) => setManualOption((o) => ({ ...o, pros: e.target.value }))} className={inputCls} />
                </Field>
                <Field label="Cons">
                  <input value={manualOption.cons} onChange={(e) => setManualOption((o) => ({ ...o, cons: e.target.value }))} className={inputCls} />
                </Field>
              </div>
              <button
                onClick={addManualOption}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium"
              >
                Save option
              </button>
            </div>
          )}

          {detail.solutionOptions.length === 0 ? (
            <p className="text-xs text-slate-400">No candidate solutions logged yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {detail.solutionOptions.map((o) => (
                <div
                  key={o.id}
                  className={`rounded-lg border p-3 ${o.isSelected ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-800">
                      {o.name}
                      {o.createdByAi && <span className="ml-1.5 text-[10px] text-indigo-500 align-middle">AI</span>}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {o.isSelected && <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-0.5"><CheckCircle2 size={11} /> Selected</span>}
                      <button onClick={() => removeOption(o.id)} className="text-slate-400 hover:text-rose-600">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  {o.description && <p className="text-[11px] text-slate-600 mb-1.5">{o.description}</p>}
                  {(o.pros || o.cons) && (
                    <div className="grid grid-cols-2 gap-2 mb-1.5">
                      {o.pros && <p className="text-[10px] text-emerald-700"><span className="font-medium">Pros:</span> {o.pros}</p>}
                      {o.cons && <p className="text-[10px] text-rose-700"><span className="font-medium">Cons:</span> {o.cons}</p>}
                    </div>
                  )}
                  {o.feasibilityNotes && <p className="text-[10px] text-slate-400 mb-2">{o.feasibilityNotes}</p>}
                  {!o.isSelected && (
                    <button
                      onClick={() => selectOption(o.id)}
                      className="text-[11px] px-2 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      Select this option
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
