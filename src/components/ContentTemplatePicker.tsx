"use client";
import { useEffect, useState } from "react";
import { LayoutTemplate, Sparkles, Plus, Save, X } from "lucide-react";

export type ContentTemplateEntity = "RFP" | "SOW" | "STATUS_REPORT";

type ContentTemplateRow = {
  id: string;
  entityType: ContentTemplateEntity;
  kind: "SKELETON" | "STYLE_PRESET";
  name: string;
  description: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot: any;
};

const selectCls = "text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent-500";
const smallInputCls = "w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent-500";

async function fetchTemplates(entityType: ContentTemplateEntity, kind: "SKELETON" | "STYLE_PRESET"): Promise<ContentTemplateRow[]> {
  const res = await fetch(`/api/content-templates?entityType=${entityType}&kind=${kind}`);
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

// Dropdown of saved SKELETON templates (reusable starting-point fields) for RFP/SOW "new"
// forms. Selecting one hands the raw snapshot back to the caller to merge into its own form
// state — this component never applies anything itself, so it stays usable for both RFP's
// pointer-field shape and SOW's summary-field shape without knowing either.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SkeletonPicker({ entityType, onApply }: { entityType: "RFP" | "SOW"; onApply: (snapshot: any) => void }) {
  const [templates, setTemplates] = useState<ContentTemplateRow[]>([]);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    fetchTemplates(entityType, "SKELETON").then(setTemplates);
  }, [entityType]);

  if (templates.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      <LayoutTemplate size={13} className="text-slate-400" />
      Start from template
      <select
        value={selected}
        onChange={(e) => {
          const id = e.target.value;
          setSelected(id);
          const t = templates.find((t) => t.id === id);
          if (t) onApply(t.snapshot);
        }}
        className={selectCls}
      >
        <option value="">— Blank —</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
    </label>
  );
}

// Button that saves the caller's current field values as a new reusable SKELETON template —
// buildSnapshot() is called lazily (only once the owner confirms a name), so it can safely
// read the latest form state at click time.
export function SaveAsSkeletonButton({
  entityType,
  buildSnapshot,
  disabled,
}: {
  entityType: "RFP" | "SOW";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildSnapshot: () => any;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/content-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, kind: "SKELETON", name: name.trim(), snapshot: buildSnapshot() }),
      });
      if (res.ok) {
        setSaved(true);
        setOpen(false);
        setName("");
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-accent-600 disabled:opacity-50"
      >
        <Save size={13} /> {saved ? "Saved as template" : "Save as template"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
        className={`${smallInputCls} w-40`}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <button type="button" onClick={save} disabled={saving || !name.trim()} className="text-accent-600 hover:text-accent-700 disabled:opacity-50">
        <Save size={14} />
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
        <X size={14} />
      </button>
    </div>
  );
}

// Dropdown of saved STYLE_PRESET templates (a named instruction appended to the AI draft/
// generate prompt) plus an inline "+ New preset" creator. `value` is the selected preset's
// id (or "" for none) — passed straight through as templateId on the draft/generate request.
export function StylePresetPicker({
  entityType,
  value,
  onChange,
}: {
  entityType: ContentTemplateEntity;
  value: string;
  onChange: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<ContentTemplateRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetchTemplates(entityType, "STYLE_PRESET").then(setTemplates);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType]);

  async function createPreset() {
    if (!name.trim() || !instruction.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/content-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          kind: "STYLE_PRESET",
          name: name.trim(),
          snapshot: { systemPromptAddendum: instruction.trim() },
        }),
      });
      const created = await res.json();
      if (res.ok) {
        setTemplates((prev) => [...prev, created]);
        onChange(created.id);
        setCreating(false);
        setName("");
        setInstruction("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <Sparkles size={13} className="text-slate-400" />
      Style
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        <option value="">Default</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      {!creating ? (
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1 text-slate-400 hover:text-accent-600">
          <Plus size={12} /> New preset
        </button>
      ) : (
        <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-2 py-1">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Preset name" className={`${smallInputCls} w-28`} />
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='e.g. "formal, government-procurement tone"'
            className={`${smallInputCls} w-64`}
          />
          <button type="button" onClick={createPreset} disabled={saving || !name.trim() || !instruction.trim()} className="text-accent-600 hover:text-accent-700 disabled:opacity-50">
            <Save size={14} />
          </button>
          <button type="button" onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-600">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
