"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import { formatDateInput } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";
import { Loader2, Trash2, Boxes, Slack, Calendar, Copy, Check } from "lucide-react";
import CountryStateFields from "@/components/CountryStateFields";
import { SUB_STAGE_LABELS } from "@/lib/ideationGates";

type Stakeholder = { id: string; name: string; title: string | null; divisionId: string | null };
type OrgOption = { id: string; name: string };

// Duplicated (not imported) on purpose — "@/lib/auth" pulls in next/headers, which breaks
// the build if a value (non-type) import from it ends up in a "use client" component's
// bundle. This is the same tiny role-order check as roleAtLeast() in lib/auth.ts.
function roleAtLeast(role: SessionUser["role"], min: SessionUser["role"]) {
  const order = { VIEWER: 0, CONTRIBUTOR: 1, PM: 2, SUPER_USER: 3, ADMIN: 4 };
  return order[role] >= order[min];
}

type SimilarProjectsResult = {
  similarProjects: { name: string; whySimilar: string }[];
  commonRequirementThemes: string[];
  commonRisks: string[];
  vendorTechLessons: string[];
  note?: string;
};

// Project metadata + housekeeping — everything that ISN'T part of the gated Plan sequence
// (that's the 5 sub-tabs above this, in PlanTab.tsx). Stage itself is no longer editable
// here: it's derived from ideationSubStage as each Plan gate is satisfied, shown below as a
// read-only badge instead of a dropdown.
export default function OverviewTab({ detail, user }: { detail: ProjectDetail; user: SessionUser | null }) {
  const router = useRouter();
  const p = detail.project;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: p.name,
    description: p.description ?? "",
    sponsor: p.sponsor ?? "",
    sponsorStakeholderId: p.sponsorStakeholderId ?? "",
    projectManager: p.projectManager ?? "",
    priority: p.priority,
    startDate: formatDateInput(p.startDate),
    targetEndDate: formatDateInput(p.targetEndDate),
    budgetPlanned: p.budgetPlanned ?? 0,
    budgetActual: p.budgetActual ?? 0,
    percentComplete: p.percentComplete,
    country: p.country ?? "",
    stateProvince: p.stateProvince ?? "",
    program: p.program ?? "",
  });

  const [findingSimilar, setFindingSimilar] = useState(false);
  const [similarError, setSimilarError] = useState<string | null>(null);
  const [similarResult, setSimilarResult] = useState<SimilarProjectsResult | null>(null);

  async function findSimilarProjects() {
    setFindingSimilar(true);
    setSimilarError(null);
    setSimilarResult(null);
    try {
      const res = await fetch("/api/ai/similar-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSimilarError(data?.error ?? "Couldn't find similar projects right now.");
        return;
      }
      setSimilarResult(data);
    } finally {
      setFindingSimilar(false);
    }
  }

  // Integrations (#263): Slack incoming-webhook + a revocable calendar (.ics) feed token.
  // Both PM-tier+ settings, mirroring the gate on the PATCH route / dedicated endpoints below.
  const [slackUrl, setSlackUrl] = useState(p.slackWebhookUrl ?? "");
  const [savingSlack, setSavingSlack] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [slackTestResult, setSlackTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [icsToken, setIcsToken] = useState<string | null>(p.icsToken ?? null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [copiedFeedUrl, setCopiedFeedUrl] = useState(false);

  async function saveSlackWebhook() {
    setSavingSlack(true);
    setSlackTestResult(null);
    await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slackWebhookUrl: slackUrl.trim() || null }),
    });
    setSavingSlack(false);
    router.refresh();
  }

  async function sendSlackTest() {
    setTestingSlack(true);
    setSlackTestResult(null);
    try {
      const res = await fetch(`/api/projects/${p.id}/slack-test`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setSlackTestResult({
        ok: res.ok,
        message: res.ok ? "Test message sent — check the channel." : data?.error ?? "Couldn't send a test message.",
      });
    } finally {
      setTestingSlack(false);
    }
  }

  async function generateFeedLink() {
    setFeedBusy(true);
    try {
      const res = await fetch(`/api/projects/${p.id}/calendar-token`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setIcsToken(data.icsToken);
    } finally {
      setFeedBusy(false);
    }
  }

  async function revokeFeedLink() {
    setFeedBusy(true);
    try {
      await fetch(`/api/projects/${p.id}/calendar-token`, { method: "DELETE" });
      setIcsToken(null);
    } finally {
      setFeedBusy(false);
    }
  }

  function copyFeedUrl() {
    if (!icsToken || typeof window === "undefined") return;
    const url = `${window.location.origin}/calendar/${icsToken}/feed.ics`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedFeedUrl(true);
      setTimeout(() => setCopiedFeedUrl(false), 2000);
    });
  }

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The stakeholder directory only exists for projects tied to a client organization — this
  // fetches THIS project's org's directory (not the caller's own), so internal staff working
  // on a client project still see that client's sponsors. Empty list = fall back to free text.
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  useEffect(() => {
    fetch(`/api/projects/${p.id}/stakeholders`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setStakeholders(Array.isArray(rows) ? rows : []))
      .catch(() => setStakeholders([]));
  }, [p.id]);

  // Mapping a project to a company is an ADMIN-only tenancy decision (see the PATCH route) —
  // only fetch the company list, and only send organizationId in the save payload, when this
  // user is actually an ADMIN. Every other role's save() call never touches this field.
  const isAdmin = user?.role === "ADMIN";
  const [orgOptions, setOrgOptions] = useState<OrgOption[]>([]);
  const [companyOrgId, setCompanyOrgId] = useState(p.organizationId ?? "");
  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/organizations")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setOrgOptions(Array.isArray(rows) ? rows : []))
      .catch(() => setOrgOptions([]));
  }, [isAdmin]);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isAdmin ? { ...form, organizationId: companyOrgId || null } : form),
    });
    setSaving(false);
    router.refresh();
  }

  async function deleteProject() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data?.error ?? "Could not delete this project.");
        return;
      }
      router.push("/projects");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  const canDelete = user ? roleAtLeast(user.role, "PM") : false;
  const closedOut = p.stage === "CLOSING" || p.stage === "CLOSED";

  return (
    <div className="space-y-6 max-w-3xl">
      <Card title="Project Details">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Project Name">
            <input value={form.name} onChange={(e) => update("name", e.target.value)} className={inputCls} />
          </Field>
          {isAdmin && (
            <Field label="Company">
              <select value={companyOrgId} onChange={(e) => setCompanyOrgId(e.target.value)} className={inputCls}>
                <option value="">— Internal only (no company) —</option>
                {orgOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Stage">
            <div className={`${inputCls} bg-slate-50 text-slate-600`}>
              {p.stage}{!closedOut && ` · ${SUB_STAGE_LABELS[p.ideationSubStage]}`}
            </div>
          </Field>
          <Field label="Sponsor">
            {stakeholders.length > 0 ? (
              <select
                value={form.sponsorStakeholderId}
                onChange={(e) => update("sponsorStakeholderId", e.target.value)}
                className={inputCls}
              >
                <option value="">— Select sponsor —</option>
                {stakeholders.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.title ? ` (${s.title})` : ""}</option>
                ))}
              </select>
            ) : (
              <input value={form.sponsor} onChange={(e) => update("sponsor", e.target.value)} className={inputCls} placeholder="No stakeholder directory yet — enter a name" />
            )}
          </Field>
          <Field label="Project Manager">
            <input value={form.projectManager} onChange={(e) => update("projectManager", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Priority">
            <select value={form.priority} onChange={(e) => update("priority", e.target.value as typeof form.priority)} className={inputCls}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="% Complete">
            <input type="number" min={0} max={100} value={form.percentComplete} onChange={(e) => update("percentComplete", Number(e.target.value))} className={inputCls} />
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
          <Field label="Start Date">
            <input type="date" value={form.startDate} onChange={(e) => update("startDate", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Target End Date">
            <input type="date" value={form.targetEndDate} onChange={(e) => update("targetEndDate", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Budget Planned ($)">
            <input type="number" value={form.budgetPlanned} onChange={(e) => update("budgetPlanned", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Budget Actual ($)">
            <input type="number" value={form.budgetActual} onChange={(e) => update("budgetActual", Number(e.target.value))} className={inputCls} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Description">
            <textarea value={form.description} onChange={(e) => update("description", e.target.value)} className={inputCls} rows={2} />
          </Field>
        </div>
        {canDelete && closedOut && (
          <Field label="Close-out stage">
            <select
              value={p.stage}
              onChange={async (e) => {
                await fetch(`/api/projects/${p.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ stage: e.target.value }),
                });
                router.refresh();
              }}
              className={inputCls}
            >
              <option value="CLOSING">CLOSING</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </Field>
        )}
      </Card>

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </PrimaryButton>
        <AutoHealthNote detail={detail} />
        {canDelete && p.ideationSubStage === "READY_FOR_EXECUTION" && !closedOut && (
          <button
            onClick={async () => {
              await fetch(`/api/projects/${p.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ stage: "CLOSING" }),
              });
              router.refresh();
            }}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Begin close-out
          </button>
        )}
      </div>

      <Card
        title="Similar past projects & patterns"
        action={
          <button
            onClick={findSimilarProjects}
            disabled={findingSimilar}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50"
          >
            {findingSimilar ? <Loader2 size={13} className="animate-spin" /> : <Boxes size={13} />}
            Find similar projects
          </button>
        }
      >
        <p className="text-xs text-slate-400 mb-2">
          Looks across other projects you have access to for recurring requirement themes, risks, and
          vendor/technology lessons that could apply here.
        </p>
        {similarError && <p className="text-xs text-rose-600 mb-2">{similarError}</p>}
        {similarResult && (
          <div className="border border-slate-200 bg-slate-50 rounded-lg p-3 space-y-2">
            {similarResult.note && <p className="text-xs text-slate-500">{similarResult.note}</p>}
            {similarResult.similarProjects.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">Most similar projects</p>
                <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                  {similarResult.similarProjects.map((sp, i) => (
                    <li key={i}><span className="font-medium">{sp.name}</span> — {sp.whySimilar}</li>
                  ))}
                </ul>
              </div>
            )}
            {similarResult.commonRequirementThemes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">Common requirement themes</p>
                <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                  {similarResult.commonRequirementThemes.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
            {similarResult.commonRisks.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">Common risks</p>
                <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5">
                  {similarResult.commonRisks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {similarResult.vendorTechLessons.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-700 mb-1">Vendor / technology lessons</p>
                <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5">
                  {similarResult.vendorTechLessons.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {canDelete && (
        <Card title="Integrations">
          <div className="space-y-5">
            <div>
              <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                <Slack size={14} /> Slack notifications
              </p>
              <p className="text-xs text-slate-400 mb-2">
                Paste a Slack incoming-webhook URL to post new tasks, status changes, and task comments to a channel.
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={slackUrl}
                  onChange={(e) => setSlackUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className={inputCls}
                />
                <button
                  onClick={saveSlackWebhook}
                  disabled={savingSlack}
                  className="text-xs px-3 py-2 rounded-lg bg-accent-600 text-white disabled:opacity-50 font-medium shrink-0"
                >
                  {savingSlack ? "Saving..." : "Save"}
                </button>
                {p.slackWebhookUrl && (
                  <button
                    onClick={sendSlackTest}
                    disabled={testingSlack}
                    className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 font-medium shrink-0"
                  >
                    {testingSlack ? "Sending..." : "Send test"}
                  </button>
                )}
              </div>
              {slackTestResult && (
                <p className={`text-xs mt-1.5 ${slackTestResult.ok ? "text-emerald-600" : "text-rose-600"}`}>
                  {slackTestResult.message}
                </p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                <Calendar size={14} /> Calendar feed
              </p>
              <p className="text-xs text-slate-400 mb-2">
                A read-only .ics link with this project&apos;s task due dates — subscribe to it from Google Calendar,
                Outlook, or Apple Calendar.
              </p>
              {icsToken ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-500 truncate">
                    {typeof window !== "undefined" ? `${window.location.origin}/calendar/${icsToken}/feed.ics` : `/calendar/${icsToken}/feed.ics`}
                  </div>
                  <button
                    onClick={copyFeedUrl}
                    className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium shrink-0"
                  >
                    {copiedFeedUrl ? <Check size={12} /> : <Copy size={12} />}
                    {copiedFeedUrl ? "Copied" : "Copy"}
                  </button>
                  <button
                    onClick={revokeFeedLink}
                    disabled={feedBusy}
                    className="text-xs px-2.5 py-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-50 font-medium shrink-0"
                  >
                    Revoke
                  </button>
                </div>
              ) : (
                <button
                  onClick={generateFeedLink}
                  disabled={feedBusy}
                  className="text-xs px-3 py-2 rounded-lg bg-accent-600 text-white disabled:opacity-50 font-medium"
                >
                  {feedBusy ? "Generating..." : "Get calendar link"}
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      {canDelete && (
        <Card title="Danger Zone">
          <p className="text-sm text-slate-500 mb-3">
            Permanently delete this project and everything under it — tasks, milestones, sprints,
            invoices, charter, and reports. This cannot be undone.
          </p>
          {deleteError && <p className="text-xs text-rose-600 mb-2">{deleteError}</p>}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 font-medium"
            >
              <Trash2 size={14} /> Delete Project
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm text-slate-700">
                Type-free confirm: really delete <span className="font-semibold">{p.name}</span>?
              </p>
              <button
                onClick={deleteProject}
                disabled={deleting}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50 font-medium"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? "Deleting..." : "Yes, delete permanently"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function AutoHealthNote({ detail }: { detail: ProjectDetail }) {
  return (
    <p className="text-xs text-slate-400">
      Auto health: <span className="font-medium">{detail.autoRag}</span> — {detail.autoRagReasons.join("; ")}
    </p>
  );
}
