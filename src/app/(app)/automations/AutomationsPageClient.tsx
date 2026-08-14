"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { Zap, Sparkles, Trash2, Loader2 } from "lucide-react";

type Rule = {
  id: string;
  name: string;
  trigger: string;
  conditions: Record<string, unknown>;
  actions: Array<{ type: string; message?: string; value?: string }>;
  isActive: boolean;
  runCount: number;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

const TRIGGER_LABELS: Record<string, string> = {
  TASK_STATUS_CHANGED: "Task status changes",
  TASK_ASSIGNED: "Task is assigned",
  TASK_OVERDUE: "Task becomes overdue (checked daily)",
  RISK_CREATED: "A risk is logged",
  DELIVERABLE_APPROVED: "A deliverable is approved",
};

export default function AutomationsPageClient() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [instruction, setInstruction] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Rule | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/automations")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setRules(Array.isArray(rows) ? rows : []))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function draftWithAi() {
    if (!instruction.trim()) return;
    setDrafting(true);
    setDraftError(null);
    setDraft(null);
    try {
      const res = await fetch("/api/ai/draft-automation-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDraftError(data?.error ?? "Couldn't draft that rule.");
        return;
      }
      setDraft({ ...data, id: "", isActive: true, runCount: 0 });
    } finally {
      setDrafting(false);
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, trigger: draft.trigger, conditions: draft.conditions, actions: draft.actions }),
      });
      if (res.ok) {
        setDraft(null);
        setInstruction("");
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, isActive: boolean) {
    await fetch(`/api/automations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/automations/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <Topbar title="Automations" subtitle="When X happens, do Y — describe it in plain English and Executa drafts the rule" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-2">New rule</p>
          <div className="flex items-center gap-2 mb-3">
            <input
              className={inputCls}
              placeholder='e.g. "Notify the assignee if a task is overdue"'
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
            />
            <button
              onClick={draftWithAi}
              disabled={drafting || !instruction.trim()}
              className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
            >
              {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {drafting ? "Drafting…" : "Draft with AI"}
            </button>
          </div>
          {draftError && <p className="text-xs text-rose-600 mb-2">{draftError}</p>}
          {draft && (
            <div className="border border-slate-200 rounded-lg p-3 space-y-1.5 mb-2">
              <p className="text-sm font-medium text-slate-800">{draft.name}</p>
              <p className="text-xs text-slate-500">Trigger: {TRIGGER_LABELS[draft.trigger] ?? draft.trigger}</p>
              <p className="text-xs text-slate-500">
                Actions: {draft.actions.map((a) => a.type).join(", ")}
              </p>
              <button
                onClick={saveDraft}
                disabled={saving}
                className="mt-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save rule"}
              </button>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap size={16} className="text-slate-400" />
            <p className="text-sm font-semibold text-slate-900">Active rules</p>
          </div>
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-6">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">No automation rules yet.</p>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2.5">
                  <div>
                    <p className="text-sm text-slate-800 font-medium">{r.name}</p>
                    <p className="text-xs text-slate-400">
                      {TRIGGER_LABELS[r.trigger] ?? r.trigger} · ran {r.runCount} time{r.runCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      <input type="checkbox" checked={r.isActive} onChange={(e) => toggle(r.id, e.target.checked)} />
                      Active
                    </label>
                    <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
