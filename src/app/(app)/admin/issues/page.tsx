"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ArrowLeft, ImageOff, X } from "lucide-react";

type IssueReport = {
  id: string;
  reporterName: string | null;
  reporterEmail: string | null;
  pagePath: string;
  description: string;
  screenshotDataUrl: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "WONT_FIX";
  resolvedBy: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

const FILTERS = ["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "WONT_FIX"] as const;

const STATUS_LABELS: Record<IssueReport["status"], string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  WONT_FIX: "Won't Fix",
};

const STATUS_STYLES: Record<IssueReport["status"], string> = {
  OPEN: "bg-rose-50 text-rose-700 border-rose-200",
  IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
  RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  WONT_FIX: "bg-slate-100 text-slate-500 border-slate-200",
};

export default function IssuesPage() {
  const [entries, setEntries] = useState<IssueReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("ALL");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/issues");
    if (res.ok) setEntries(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: entries.length };
    for (const e of entries) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [entries]);

  const visible = filter === "ALL" ? entries : entries.filter((e) => e.status === filter);

  async function updateStatus(id: string, status: string) {
    setSavingId(id);
    const res = await fetch(`/api/issues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSavingId(null);
    if (res.ok) {
      const updated = await res.json();
      setEntries((prev) => prev.map((e) => (e.id === id ? updated : e)));
    }
  }

  return (
    <div>
      <Topbar
        title="Issue Reports"
        subtitle="Bugs and feedback submitted from the floating report button across the app"
        action={
          <Link href="/admin" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <ArrowLeft size={14} /> Back to Admin
          </Link>
        }
      />
      <div className="p-8">
        <div className="flex items-center gap-1.5 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
                filter === f ? "bg-accent-600 text-white border-accent-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {f === "ALL" ? "All" : STATUS_LABELS[f as IssueReport["status"]]} ({counts[f] ?? 0})
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Reporter</th>
                  <th className="px-4 py-2.5 font-medium">Page</th>
                  <th className="px-4 py-2.5 font-medium">Description</th>
                  <th className="px-4 py-2.5 font-medium">Screenshot</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0 align-top">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-slate-800 font-medium">{e.reporterName ?? "—"}</p>
                      <p className="text-xs text-slate-400">{e.reporterEmail ?? ""}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate" title={e.pagePath}>
                      {e.pagePath}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-sm">
                      <p className="whitespace-pre-wrap">{e.description}</p>
                    </td>
                    <td className="px-4 py-3">
                      {e.screenshotDataUrl ? (
                        <button onClick={() => setLightbox(e.screenshotDataUrl)} className="block h-14 w-20 rounded-md overflow-hidden border border-slate-200 hover:opacity-80">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={e.screenshotDataUrl} alt="Reported screenshot" className="h-full w-full object-cover object-top" />
                        </button>
                      ) : (
                        <div className="h-14 w-20 rounded-md border border-dashed border-slate-200 flex items-center justify-center text-slate-300">
                          <ImageOff size={16} />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={e.status}
                        disabled={savingId === e.id}
                        onChange={(ev) => updateStatus(e.id, ev.target.value)}
                        className={`text-xs font-medium rounded-full px-2 py-1 border disabled:opacity-50 ${STATUS_STYLES[e.status]}`}
                      >
                        {(["OPEN", "IN_PROGRESS", "RESOLVED", "WONT_FIX"] as const).map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      {e.resolvedBy && (
                        <p className="text-[11px] text-slate-400 mt-1">by {e.resolvedBy}</p>
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && visible.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-400">No issues reported yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 flex items-center justify-center p-8"
          onClick={() => setLightbox(null)}
        >
          <button onClick={() => setLightbox(null)} className="absolute top-6 right-6 text-white/80 hover:text-white" aria-label="Close">
            <X size={22} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Reported screenshot, full size" className="max-h-full max-w-full rounded-lg shadow-2xl" onClick={(ev) => ev.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
