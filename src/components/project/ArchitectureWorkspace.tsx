"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateInput } from "@/lib/format";
import { Sparkles, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import AiWaitIndicator from "@/components/AiWaitIndicator";
import MermaidDiagram from "@/components/MermaidDiagram";

// Plan sub-tab 3 — separate from Technical Feasibility: that step confirms the *direction*
// is sound, this confirms the specific diagram/design is sound, with its own pros/cons and
// its own approval stamp. Gate: architectureApprovedAt set (see the generic PATCH route's
// gate-transition logic in api/projects/[id]/route.ts). An "architect" role isn't modeled
// separately from PM/ADMIN today, so approval reuses the same PM+ bar as every other
// approval stamp in the app (charter, technical review).
export default function ArchitectureWorkspace({ detail }: { detail: ProjectDetail }) {
  const router = useRouter();
  const p = detail.project;

  const [form, setForm] = useState({
    highLevelArchitecture: p.highLevelArchitecture ?? "",
    architectureProsCons: p.architectureProsCons ?? "",
    architectureApprovedBy: p.architectureApprovedBy ?? "",
    architectureApprovedAt: formatDateInput(p.architectureApprovedAt),
    architectureReviewNotes: p.architectureReviewNotes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    router.refresh();
  }

  async function regenerateDiagram() {
    setRegenerating(true);
    await fetch("/api/ai/technical-recommendation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: p.id }),
    });
    setRegenerating(false);
    router.refresh();
  }

  const approved = Boolean(p.architectureApprovedAt);

  return (
    <div className="space-y-6 max-w-3xl">
      {approved && (
        <p className="text-sm text-emerald-700 flex items-center gap-1.5">
          <CheckCircle2 size={15} /> Architecture approved by {p.architectureApprovedBy} — Scope &amp; Charter is unlocked below.
        </p>
      )}

      <Card
        title="Architecture diagram"
        action={
          <button
            onClick={regenerateDiagram}
            disabled={regenerating}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
          >
            {regenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {p.architectureDiagram ? "Regenerate" : "Generate"}
          </button>
        }
      >
        <AiWaitIndicator active={regenerating} messages={["Reading the architecture description...", "Drawing the diagram..."]} className="mb-2" />
        {p.architectureDiagram ? (
          <MermaidDiagram chart={p.architectureDiagram} />
        ) : (
          <p className="text-xs text-slate-400">
            No diagram yet — generate one here, or from Technical Feasibility&apos;s recommendation.
          </p>
        )}
      </Card>

      <Card title="Design details">
        <Field label="High-level architecture">
          <textarea
            value={form.highLevelArchitecture}
            onChange={(e) => update("highLevelArchitecture", e.target.value)}
            className={inputCls}
            rows={3}
            placeholder="Describe the major components/layers and how they fit together"
          />
        </Field>
        <div className="mt-4">
          <Field label="Pros and cons of this architecture">
            <textarea
              value={form.architectureProsCons}
              onChange={(e) => update("architectureProsCons", e.target.value)}
              className={inputCls}
              rows={3}
              placeholder="Why this is the technically sound option — trade-offs, what it optimizes for, what it gives up"
            />
          </Field>
        </div>
      </Card>

      <div>
        <PrimaryButton onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</PrimaryButton>
      </div>

      <Card title="Architecture Approval">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={13} className="text-slate-500" />
          <p className="text-xs text-slate-500">
            Confirms the specific design above is technically sound — separate from the Technical Feasibility
            review, which confirmed the overall direction.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
          <Field label="Approved by">
            <input value={form.architectureApprovedBy} onChange={(e) => update("architectureApprovedBy", e.target.value)} className={inputCls} placeholder="Architect name" />
          </Field>
          <Field label="Approved on">
            <input type="date" value={form.architectureApprovedAt} onChange={(e) => update("architectureApprovedAt", e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Review notes">
          <textarea
            value={form.architectureReviewNotes}
            onChange={(e) => update("architectureReviewNotes", e.target.value)}
            className={inputCls}
            rows={2}
            placeholder="Concerns, conditions, or confirmation of this design"
          />
        </Field>
        <button
          onClick={save}
          disabled={saving}
          className="mt-3 text-xs px-3 py-1.5 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700 font-medium disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save approval"}
        </button>
      </Card>
    </div>
  );
}
