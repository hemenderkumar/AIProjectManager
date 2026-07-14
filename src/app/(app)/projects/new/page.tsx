"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Topbar from "@/components/Topbar";
import CountryStateFields from "@/components/CountryStateFields";
import AiWaitIndicator from "@/components/AiWaitIndicator";

type Stakeholder = { id: string; name: string; title: string | null };

export default function NewProjectPage() {
  return (
    <Suspense fallback={null}>
      <NewProjectForm />
    </Suspense>
  );
}

function NewProjectForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // "idea" intent (from the Ideation entry point) lands back on the Inception & Ideation
  // tab to continue brainstorming; everything else (Execution entry point, sidebar, etc.)
  // keeps the old behavior of jumping straight into the AI task planner.
  const isIdeaIntent = searchParams.get("intent") === "idea";
  const [saving, setSaving] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiFilled, setAiFilled] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    sponsor: "",
    sponsorStakeholderId: "",
    projectManager: "",
    priority: "MEDIUM",
    stage: "INCEPTION",
    country: "",
    stateProvince: "",
    program: "",
    problemStatement: "",
    proposedSolution: "",
    expectedBenefits: "",
    ideationNotes: "",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Sourced from the creating user's own organization — a new project inherits the creator's
  // organizationId, so this is the right directory to offer here (unlike the per-project
  // endpoint used once a project already exists). Non-org (internal staff) callers get a
  // 403/empty result and just see the free-text fallback below.
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  useEffect(() => {
    fetch("/api/organization/stakeholders")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setStakeholders(Array.isArray(rows) ? rows : []))
      .catch(() => setStakeholders([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const created = await res.json();
    setSaving(false);
    if (created?.id) {
      router.push(isIdeaIntent ? `/projects/${created.id}` : `/projects/${created.id}?autoplan=1`);
    }
  }

  async function generateWithAi() {
    if (!aiMessage.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiFilled(false);
    try {
      const res = await fetch("/api/ai/draft-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: aiMessage }),
      });
      const data = await res.json();
      if (!res.ok || !data?.fields) {
        setAiError(data?.error || "Couldn't generate a draft. Try adding more detail.");
        return;
      }
      const f = data.fields;
      setForm((prev) => ({
        ...prev,
        name: f.name || prev.name,
        description: f.description || prev.description,
        sponsor: f.sponsor || prev.sponsor,
        projectManager: f.projectManager || prev.projectManager,
        priority: f.priority || prev.priority,
        stage: f.stage || prev.stage,
        country: f.country || prev.country,
        program: f.program || prev.program,
        problemStatement: f.problemStatement || prev.problemStatement,
        proposedSolution: f.proposedSolution || prev.proposedSolution,
        expectedBenefits: f.expectedBenefits || prev.expectedBenefits,
        ideationNotes: f.ideationNotes || prev.ideationNotes,
      }));
      setAiFilled(true);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div>
      <Topbar
        title={isIdeaIntent ? "New Idea" : "New Project"}
        subtitle={
          isIdeaIntent
            ? "Capture the idea, then move into brainstorming and alignment before a charter is drafted"
            : "Kick off inception & ideation for a new project"
        }
      />
      <div className="p-8 max-w-3xl">
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6 space-y-3">
          <p className="text-sm font-semibold text-indigo-900">✨ Describe it, and AI fills the form</p>
          <p className="text-xs text-indigo-700">
            Type a sentence or two about the project — what it is, why it matters, who&apos;s involved —
            and the fields below will be filled in automatically. You can review and edit everything
            before creating the project.
          </p>
          <textarea
            value={aiMessage}
            onChange={(e) => setAiMessage(e.target.value)}
            rows={3}
            placeholder="e.g. We need to replace our aging invoicing system before Q3. It's costing us support tickets and slowing down finance. Sarah in Finance is sponsoring, budget is tight, this is high priority."
            className="w-full text-sm border border-indigo-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={generateWithAi}
              disabled={aiLoading || !aiMessage.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {aiLoading ? "Filling in..." : "Fill form with AI"}
            </button>
            {aiFilled && <span className="text-xs text-emerald-700 font-medium">Form updated below — review before creating.</span>}
            {aiError && <span className="text-xs text-red-600">{aiError}</span>}
          </div>
          <AiWaitIndicator
            active={aiLoading}
            messages={["Reading what you described...", "Filling in the project fields..."]}
            className="mt-3"
          />
        </div>
      </div>
      <form onSubmit={submit} className="px-8 pb-8 max-w-3xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-900">Inception</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Project Name *">
              <input required value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Stage">
              <select value={form.stage} onChange={(e) => update("stage", e.target.value)} className={inputCls}>
                <option value="INCEPTION">Inception</option>
                <option value="IDEATION">Ideation</option>
                <option value="CHARTER">Charter</option>
                <option value="EXECUTION">Execution</option>
              </select>
            </Field>
            <Field label="Sponsor">
              {stakeholders.length > 0 ? (
                <select value={form.sponsorStakeholderId} onChange={(e) => update("sponsorStakeholderId", e.target.value)} className={inputCls}>
                  <option value="">— Select sponsor —</option>
                  {stakeholders.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.title ? ` (${s.title})` : ""}</option>
                  ))}
                </select>
              ) : (
                <input value={form.sponsor} onChange={(e) => update("sponsor", e.target.value)} className={inputCls} />
              )}
            </Field>
            <Field label="Project Manager">
              <input value={form.projectManager} onChange={(e) => update("projectManager", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Priority">
              <select value={form.priority} onChange={(e) => update("priority", e.target.value)} className={inputCls}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </Field>
            <CountryStateFields
              country={form.country}
              stateProvince={form.stateProvince}
              onCountryChange={(v) => update("country", v)}
              onStateChange={(v) => update("stateProvince", v)}
              selectCls={inputCls}
            />
            <Field label="Program">
              <input value={form.program} onChange={(e) => update("program", e.target.value)} className={inputCls} placeholder="e.g. Digital Transformation" />
            </Field>
          </div>
          <Field label="Description">
            <textarea value={form.description} onChange={(e) => update("description", e.target.value)} className={inputCls} rows={2} />
          </Field>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5 space-y-4">
          <p className="text-sm font-semibold text-slate-900">Ideation</p>
          <Field label="Problem statement">
            <textarea value={form.problemStatement} onChange={(e) => update("problemStatement", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Proposed solution">
            <textarea value={form.proposedSolution} onChange={(e) => update("proposedSolution", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Expected benefits">
            <textarea value={form.expectedBenefits} onChange={(e) => update("expectedBenefits", e.target.value)} className={inputCls} rows={2} />
          </Field>
          <Field label="Ideation notes">
            <textarea value={form.ideationNotes} onChange={(e) => update("ideationNotes", e.target.value)} className={inputCls} rows={2} />
          </Field>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-600/20 transition-colors text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Project"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
