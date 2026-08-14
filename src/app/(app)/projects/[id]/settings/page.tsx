"use client";
import { useEffect, useState, use } from "react";
import Topbar from "@/components/Topbar";
import { Plus, Trash2, Settings2, Kanban } from "lucide-react";

type FieldDef = { id: string; label: string; fieldKey: string; type: string; required: boolean };
type Stage = { id: string; name: string; color: string };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

export default function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [newField, setNewField] = useState({ label: "", type: "TEXT" });
  const [newStage, setNewStage] = useState("");

  function loadFields() {
    fetch(`/api/custom-fields?entity=TASK&projectId=${id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setFields(Array.isArray(rows) ? rows : []));
  }
  function loadStages() {
    fetch(`/api/projects/${id}/workflow-stages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setStages(Array.isArray(rows) ? rows : []));
  }

  useEffect(() => {
    loadFields();
    loadStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addField() {
    if (!newField.label.trim()) return;
    await fetch("/api/custom-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity: "TASK",
        projectId: id,
        label: newField.label,
        fieldKey: newField.label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        type: newField.type,
      }),
    });
    setNewField({ label: "", type: "TEXT" });
    loadFields();
  }

  async function removeField(fieldId: string) {
    await fetch(`/api/custom-fields/${fieldId}`, { method: "DELETE" });
    loadFields();
  }

  async function addStage() {
    if (!newStage.trim()) return;
    await fetch(`/api/projects/${id}/workflow-stages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newStage }),
    });
    setNewStage("");
    loadStages();
  }

  async function removeStage(stageId: string) {
    await fetch(`/api/projects/${id}/workflow-stages/${stageId}`, { method: "DELETE" });
    loadStages();
  }

  return (
    <div>
      <Topbar title="Project Settings" subtitle="Custom fields and workflow stages for this project" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Settings2 size={16} className="text-slate-400" />
            <p className="text-sm font-semibold text-slate-900">Custom fields (Tasks)</p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Fields added here appear only on this project&rsquo;s task form, alongside any org-wide fields.
          </p>
          <div className="space-y-2 mb-3">
            {fields.length === 0 && <p className="text-xs text-slate-400">No custom fields yet.</p>}
            {fields.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                <span className="text-slate-700">{f.label} <span className="text-xs text-slate-400">({f.type.toLowerCase()})</span></span>
                <button onClick={() => removeField(f.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input className={inputCls} placeholder="Field label, e.g. Client PO Number" value={newField.label} onChange={(e) => setNewField((s) => ({ ...s, label: e.target.value }))} />
            <select className={`${inputCls} max-w-[140px]`} value={newField.type} onChange={(e) => setNewField((s) => ({ ...s, type: e.target.value }))}>
              <option value="TEXT">Text</option>
              <option value="NUMBER">Number</option>
              <option value="DATE">Date</option>
              <option value="BOOLEAN">Yes/No</option>
            </select>
            <button onClick={addField} className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700">
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Kanban size={16} className="text-slate-400" />
            <p className="text-sm font-semibold text-slate-900">Workflow stages</p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Optional override of the default To Do / In Progress / Blocked / Done columns for this project&rsquo;s board.
            Leave empty to keep the default.
          </p>
          <div className="space-y-2 mb-3">
            {stages.length === 0 && <p className="text-xs text-slate-400">Using default columns.</p>}
            {stages.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                <span className="flex items-center gap-2 text-slate-700">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                  {s.name}
                </span>
                <button onClick={() => removeStage(s.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input className={inputCls} placeholder="Stage name, e.g. In Review" value={newStage} onChange={(e) => setNewStage(e.target.value)} />
            <button onClick={addStage} className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700">
              <Plus size={13} /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
