"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { Key, Webhook, Trash2, Copy, Check, Plus } from "lucide-react";

type ApiKey = { id: string; name: string; keyPrefix: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };
type WebhookSub = { id: string; url: string; events: string[]; lastDeliveryAt: string | null; lastDeliveryStatus: number | null };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";
const WEBHOOK_EVENTS = ["TASK_STATUS_CHANGED", "PROJECT_STAGE_CHANGED", "DELIVERABLE_APPROVED", "RISK_CREATED"];

export default function IntegrationsPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [hooks, setHooks] = useState<WebhookSub[]>([]);
  const [newHookUrl, setNewHookUrl] = useState("");
  const [newHookEvents, setNewHookEvents] = useState<string[]>([]);

  function loadKeys() {
    fetch("/api/api-keys").then((r) => (r.ok ? r.json() : [])).then((rows) => setKeys(Array.isArray(rows) ? rows.filter((k: ApiKey) => !k.revokedAt) : []));
  }
  function loadHooks() {
    fetch("/api/webhooks").then((r) => (r.ok ? r.json() : [])).then((rows) => setHooks(Array.isArray(rows) ? rows : []));
  }
  useEffect(() => { loadKeys(); loadHooks(); }, []);

  async function createKey() {
    if (!newKeyName.trim()) return;
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    });
    if (res.ok) {
      const created = await res.json();
      setRevealedKey(created.rawKey);
      setNewKeyName("");
      loadKeys();
    }
  }

  async function revokeKey(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    loadKeys();
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
              <div key={k.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                <span className="text-slate-700">{k.name} <span className="text-xs text-slate-400 font-mono">{k.keyPrefix}…</span></span>
                <button onClick={() => revokeKey(k.id)} className="text-slate-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input className={inputCls} placeholder="Key name, e.g. Zapier integration" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} />
            <button onClick={createKey} className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700">
              <Plus size={13} /> Create
            </button>
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
