"use client";
import { useEffect, useState } from "react";
import { Github, X, Loader2, ExternalLink } from "lucide-react";

type Link = { id: string; repo: string; issueOrPrNumber: number; linkType: string; url: string };

// In-context GitHub issue/PR link panel, same collapsed-until-clicked pattern as
// TaskDependencies/TaskComments. v1 is a link, not two-way sync -- see the schema comment on
// taskGithubLinks for why.
export default function TaskGithubLinks({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ repo: "", issueOrPrNumber: "", url: "", linkType: "ISSUE" });
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/github-links`);
      if (res.ok) setLinks(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function addLink() {
    if (!form.repo.trim() || !form.issueOrPrNumber || !form.url.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/github-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setForm({ repo: "", issueOrPrNumber: "", url: "", linkType: "ISSUE" });
        await load();
      }
    } finally {
      setAdding(false);
    }
  }

  async function remove(linkId: string) {
    await fetch(`/api/projects/${projectId}/tasks/${taskId}/github-links/${linkId}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="text-xs">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-slate-400 hover:text-slate-600">
        <Github size={12} /> {open ? "Hide GitHub" : "GitHub"}
      </button>
      {open && (
        <div className="mt-1.5 border border-slate-100 rounded-lg p-2 space-y-1.5 bg-slate-50/50">
          {loading && <Loader2 size={12} className="animate-spin text-slate-400" />}
          {!loading &&
            links.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-1">
                <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent-600 hover:underline truncate">
                  <ExternalLink size={10} /> {l.repo}#{l.issueOrPrNumber}
                </a>
                <button onClick={() => remove(l.id)} className="text-slate-300 hover:text-rose-500"><X size={11} /></button>
              </div>
            ))}
          <div className="flex items-center gap-1 pt-1">
            <input
              placeholder="owner/repo"
              value={form.repo}
              onChange={(e) => setForm((f) => ({ ...f, repo: e.target.value }))}
              className="w-20 border border-slate-200 rounded px-1 py-0.5 text-xs"
            />
            <input
              placeholder="#"
              value={form.issueOrPrNumber}
              onChange={(e) => setForm((f) => ({ ...f, issueOrPrNumber: e.target.value }))}
              className="w-10 border border-slate-200 rounded px-1 py-0.5 text-xs"
            />
            <input
              placeholder="URL"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              className="flex-1 min-w-0 border border-slate-200 rounded px-1 py-0.5 text-xs"
            />
            <button onClick={addLink} disabled={adding} className="text-accent-600 hover:text-accent-700 disabled:opacity-50 shrink-0">
              {adding ? <Loader2 size={12} className="animate-spin" /> : "Add"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
