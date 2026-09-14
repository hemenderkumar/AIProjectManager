"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { Key, Webhook, Trash2, Copy, Check, Plus } from "lucide-react";

type ApiKey = {
  id: string; name: string; keyPrefix: string; scopes: string[];
  projectId: string | null; projectName: string | null;
  defaultAssigneeUserId: string | null; defaultAssigneeName: string | null;
  createdAt: string; lastUsedAt: string | null; revokedAt: string | null;
};
type WebhookSub = { id: string; url: string; events: string[]; lastDeliveryAt: string | null; lastDeliveryStatus: number | null };
type ProjectOption = { id: string; name: string };
type UserOption = { id: string; name: string };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";
const WEBHOOK_EVENTS = [
  "TASK_STATUS_CHANGED",
  "PROJECT_STAGE_CHANGED",
  "DELIVERABLE_APPROVED",
  "RISK_CREATED",
  "INCIDENT_CREATED",
  "INCIDENT_STATUS_CHANGED",
  "INCIDENT_ESCALATED",
  "DEMAND_REQUEST_CREATED",
  "DEMAND_REQUEST_STATUS_CHANGED",
  "IDEA_CREATED",
  "IDEA_STAGE_CHANGED",
];

export default function IntegrationsPageClient() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read"]);
  const [newKeyProjectId, setNewKeyProjectId] = useState<string>("");
  const [newKeyAssigneeId, setNewKeyAssigneeId] = useState<string>("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [orgUsers, setOrgUsers] = useState<UserOption[]>([]);
  const [reassigningKeyId, setReassigningKeyId] = useState<string | null>(null);

  const [hooks, setHooks] = useState<WebhookSub[]>([]);
  const [newHookUrl, setNewHookUrl] = useState("");
  const [newHookEvents, setNewHookEvents] = useState<string[]>([]);

  function loadKeys() {
    fetch("/api/api-keys").then((r) => (r.ok ? r.json() : [])).then((rows) => setKeys(Array.isArray(rows) ? rows.filter((k: ApiKey) => !k.revokedAt) : []));
  }
  function loadHooks() {
    fetch("/api/webhooks").then((r) => (r.ok ? r.json() : [])).then((rows) => setHooks(Array.isArray(rows) ? rows : []));
  }
  function loadProjects() {
    fetch("/api/projects").then((r) => (r.ok ? r.json() : [])).then((rows) => setProjects(Array.isArray(rows) ? rows.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) : []));
  }
  function loadOrgUsers() {
    // Best-effort: internal (org-less) staff don't have a "my organization" user list, so this
    // 403s harmlessly for them -- the default-assignee picker just stays empty in that case.
    fetch("/api/organization/users").then((r) => (r.ok ? r.json() : [])).then((rows) => setOrgUsers(Array.isArray(rows) ? rows.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })) : [])).catch(() => {});
  }
  useEffect(() => { loadKeys(); loadHooks(); loadProjects(); loadOrgUsers(); }, []);

  async function createKey() {
    if (!newKeyName.trim() || !newKeyScopes.length) return;
    setKeyError(null);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName, scopes: newKeyScopes, projectId: newKeyProjectId || null, defaultAssigneeUserId: newKeyAssigneeId || null }),
    });
    if (res.ok) {
      const created = await res.json();
      setRevealedKey(created.rawKey);
      setNewKeyName("");
      setNewKeyScopes(["read"]);
      setNewKeyProjectId("");
      setNewKeyAssigneeId("");
      loadKeys();
    } else {
      const body = await res.json().catch(() => ({}));
      setKeyError(body.error || "Could not create API key");
    }
  }

  async function revokeKey(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    loadKeys();
  }

  // Retargets an existing key's default assignee entirely from the UI -- no code, no
  // regenerating the key, nothing for whoever owns the calling application to redo.
  async function setDefaultAssignee(id: string, defaultAssigneeUserId: string) {
    setReassigningKeyId(id);
    try {
      await fetch(`/api/api-keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultAssigneeUserId: defaultAssigneeUserId || null }),
      });
      loadKeys();
    } finally {
      setReassigningKeyId(null);
    }
  }

  async function createHook() {
    if (!newHookUrl.trim() || !newHookEvents.length) return;
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: newHookUrl, events: newHookEvents }),
    });
    if (res.ok) {
      setNewHookUrl("");
      setNewHookEvents([]);
      loadHooks();
    }
  }

  async function removeHook(id: string) {
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    loadHooks();
  }

  return (
    <div>
      <Topbar title="API & Integrations" subtitle="Public REST API keys and outbound webhooks — build your own connectors or wire up Zapier/Make" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Key size={16} className="text-slate-400" />
            <p className="text-sm font-semibold text-slate-900">API keys</p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Authenticate against <code className="bg-slate-100 px-1 rounded">/api/public/v1/*</code> with{" "}
            <code className="bg-slate-100 px-1 rounded">Authorization: Bearer &lt;key&gt;</code>. Shown once at creation — copy it now.
          </p>
          {revealedKey && (
            <div className="mb-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <code className="text-xs text-amber-800 flex-1 truncate">{revealedKey}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(revealedKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                className="text-amber-700 hover:text-amber-900"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          )}
          <div className="space-y-2 mb-3">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2 gap-3">
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-slate-700">{k.name} <span className="text-xs text-slate-400 font-mono">{k.keyPrefix}…</span></span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {k.scopes.map((s) => (
                      <span key={s} className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{s}</span>
                    ))}
                    {k.projectName ? (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent-50 text-accent-700">restricted to {k.projectName}</span>
                    ) : (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-50 text-slate-400">all projects</span>
                    )}
                  </div>
                  {orgUsers.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400 shrink-0">New incidents auto-assign to:</span>
                      <select
                        className="text-xs border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 disabled:opacity-50"
                        value={k.defaultAssigneeUserId ?? ""}
                        disabled={reassigningKeyId === k.id}
                        onChange={(e) => setDefaultAssignee(k.id, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {orgUsers.map((u) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <button onClick={() => revokeKey(k.id)} className="shrink-0 text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <input className={inputCls} placeholder="Key name, e.g. Zapier integration" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                {["read", "write"].map((s) => (
                  <label key={s} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newKeyScopes.includes(s)}
                      onChange={(e) => setNewKeyScopes((prev) => (e.target.checked ? [...prev, s] : prev.filter((x) => x !== s)))}
                    />
                    {s}
                  </label>
                ))}
              </div>
              <select className={inputCls + " w-auto"} value={newKeyProjectId} onChange={(e) => setNewKeyProjectId(e.target.value)}>
                <option value="">All projects (unrestricted)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {orgUsers.length > 0 && (
                <select className={inputCls + " w-auto"} value={newKeyAssigneeId} onChange={(e) => setNewKeyAssigneeId(e.target.value)}>
                  <option value="">No default assignee</option>
                  {orgUsers.map((u) => (
                    <option key={u.id} value={u.id}>Auto-assign to {u.name}</option>
                  ))}
                </select>
              )}
              <button onClick={createKey} className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700">
                <Plus size={13} /> Create
              </button>
            </div>
            {keyError && <p className="text-xs text-rose-600">{keyError}</p>}
            <p className="text-xs text-slate-400">
              Setting a default assignee means a calling application that just posts a title gets automatically routed to that person — no code required on their end.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Webhook size={16} className="text-slate-400" />
            <p className="text-sm font-semibold text-slate-900">Webhooks</p>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Signed HMAC-SHA256 POST to your URL on each event (header <code className="bg-slate-100 px-1 rounded">X-Executa-Signature</code>).
          </p>
          <div className="space-y-2 mb-3">
            {hooks.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                <div>
                  <p className="text-slate-700 truncate max-w-xs">{h.url}</p>
                  <p className="text-xs text-slate-400">{h.events.join(", ")}{h.lastDeliveryStatus != null ? ` · last: ${h.lastDeliveryStatus}` : ""}</p>
                </div>
                <button onClick={() => removeHook(h.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <input className={inputCls} placeholder="https://your-endpoint.example.com/webhook" value={newHookUrl} onChange={(e) => setNewHookUrl(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-1.5 text-xs text-slate-600 border border-slate-200 rounded-full px-2.5 py-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newHookEvents.includes(ev)}
                    onChange={(e) => setNewHookEvents((prev) => (e.target.checked ? [...prev, ev] : prev.filter((x) => x !== ev)))}
                  />
                  {ev.replace(/_/g, " ").toLowerCase()}
                </label>
              ))}
            </div>
            <button onClick={createHook} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700">
              <Plus size={13} /> Add webhook
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
