"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import { LayoutTemplate, Rocket } from "lucide-react";

type Template = {
  id: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  snapshot: { taskSkeleton?: unknown[] };
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [instantiating, setInstantiating] = useState<string | null>(null);
  const [newName, setNewName] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setTemplates(Array.isArray(rows) ? rows : []))
      .finally(() => setLoading(false));
  }, []);

  async function instantiate(templateId: string) {
    const name = newName[templateId]?.trim();
    if (!name) return;
    setInstantiating(templateId);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "instantiate", templateId, newProjectName: name }),
      });
      const created = await res.json();
      if (res.ok) router.push(`/projects/${created.id}`);
    } finally {
      setInstantiating(null);
    }
  }

  return (
    <div>
      <Topbar
        title="Project Templates"
        subtitle="Start a new project from a saved skeleton instead of a blank page — save any existing project as a template from its Danger Zone settings"
      />
      <div className="p-8 max-w-4xl space-y-4">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
        ) : templates.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-10 text-center">
            <LayoutTemplate size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-sm text-slate-500">No templates yet. Open any project and use &ldquo;Save as Template&rdquo; to create one.</p>
          </div>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                  {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                  <p className="text-xs text-slate-400 mt-1">
                    {(t.snapshot?.taskSkeleton?.length ?? 0)} task{(t.snapshot?.taskSkeleton?.length ?? 0) === 1 ? "" : "s"} · saved by {t.createdBy ?? "someone"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  className={inputCls}
                  placeholder="New project name"
                  value={newName[t.id] ?? ""}
                  onChange={(e) => setNewName((prev) => ({ ...prev, [t.id]: e.target.value }))}
                />
                <button
                  onClick={() => instantiate(t.id)}
                  disabled={instantiating === t.id || !newName[t.id]?.trim()}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-600 text-white hover:bg-accent-700 disabled:opacity-50"
                >
                  <Rocket size={13} /> {instantiating === t.id ? "Creating…" : "Use template"}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
