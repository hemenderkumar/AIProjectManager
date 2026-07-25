"use client";
import { useEffect, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { Loader2, Sparkles, Zap, Clock, AlertCircle } from "lucide-react";

type RoadmapSummary = { id: string; createdAt: string; createdBy: string | null; executiveSummary: string | null; itemCount: number };
type RoadmapItem = {
  id: string;
  projectId: string;
  projectName: string;
  impact: string;
  effort: string;
  quickWin: boolean;
  rationale: string | null;
};
type RoadmapPhase = { id: string; label: string; focus: string | null; actions: string | null };
type RoadmapDetail = { id: string; createdAt: string; createdBy: string | null; executiveSummary: string | null; items: RoadmapItem[]; phases: RoadmapPhase[] };

function tagCls(level: string) {
  if (level === "HIGH") return "bg-rose-50 text-rose-700";
  if (level === "MEDIUM") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

export default function RoadmapPage() {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<RoadmapSummary[]>([]);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [canGenerate, setCanGenerate] = useState(false);
  const [selected, setSelected] = useState<RoadmapDetail | null>(null);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/roadmap");
    if (res.ok) {
      const data = await res.json();
      setSummaries(data.roadmaps || []);
      setEligibleCount(data.eligibleCount || 0);
      setCanGenerate(!!data.canGenerate);
      if (data.roadmaps?.[0]) {
        const detailRes = await fetch(`/api/roadmap/${data.roadmaps[0].id}`);
        if (detailRes.ok) setSelected((await detailRes.json()).roadmap);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadList();
  }, [loadList]);

  async function selectRoadmap(id: string) {
    const res = await fetch(`/api/roadmap/${id}`);
    if (res.ok) setSelected((await res.json()).roadmap);
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/roadmap", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't generate a roadmap");
        return;
      }
      setSelected(data.roadmap);
      await loadList();
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Topbar title="Roadmap" subtitle="Quick wins vs long-term bets, across everything you've assessed" />
        <div className="p-8 flex items-center gap-2 text-sm text-slate-400">
          <Loader2 size={15} className="animate-spin" /> Loading...
        </div>
      </div>
    );
  }

  const quickWins = selected?.items.filter((i) => i.quickWin) ?? [];
  const longerTerm = selected?.items.filter((i) => !i.quickWin) ?? [];

  return (
    <div>
      <Topbar
        title="Roadmap"
        subtitle="Quick wins vs long-term bets, across everything you've assessed"
        action={
          canGenerate ? (
            <button
              onClick={generate}
              disabled={generating || eligibleCount === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {generating ? "Generating..." : "Generate Roadmap"}
            </button>
          ) : null
        }
      />
      <div className="p-8 max-w-5xl space-y-6">
        {error && (
          <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-900">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {eligibleCount === 0 && !selected && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6 text-center">
            <p className="text-sm font-semibold text-slate-900 mb-1">Nothing to prioritize yet</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              An idea needs a Feasibility score (Ideation &gt; Technical Feasibility) before it can be placed on
              the roadmap. Assess a few ideas, then come back here.
            </p>
          </div>
        )}

        {selected && (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">
                Generated {new Date(selected.createdAt).toLocaleString()}
                {selected.createdBy ? ` by ${selected.createdBy}` : ""}
              </p>
              {summaries.length > 1 && (
                <select
                  value={selected.id}
                  onChange={(e) => selectRoadmap(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600"
                >
                  {summaries.map((s) => (
                    <option key={s.id} value={s.id}>
                      {new Date(s.createdAt).toLocaleDateString()} · {s.itemCount} ideas
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selected.executiveSummary && (
              <div className="bg-slate-900 text-white rounded-xl p-5">
                <p className="text-sm font-semibold mb-1.5">Executive summary</p>
                <p className="text-xs text-slate-300 leading-relaxed">{selected.executiveSummary}</p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Zap size={16} className="text-emerald-600" />
                  <p className="text-sm font-semibold text-slate-900">Quick wins</p>
                </div>
                <div className="space-y-2.5">
                  {quickWins.length === 0 && <p className="text-xs text-slate-400">None this round.</p>}
                  {quickWins.map((it) => (
                    <RoadmapItemCard key={it.id} item={it} />
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={16} className="text-slate-500" />
                  <p className="text-sm font-semibold text-slate-900">Longer-term bets</p>
                </div>
                <div className="space-y-2.5">
                  {longerTerm.length === 0 && <p className="text-xs text-slate-400">None this round.</p>}
                  {longerTerm.map((it) => (
                    <RoadmapItemCard key={it.id} item={it} />
                  ))}
                </div>
              </div>
            </div>

            {selected.phases.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Suggested sequencing</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {selected.phases.map((ph) => (
                    <div key={ph.id} className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
                      <p className="text-sm font-semibold text-accent-700 mb-1">{ph.label}</p>
                      {ph.focus && <p className="text-xs text-slate-500 mb-2">{ph.focus}</p>}
                      <ul className="space-y-1">
                        {(ph.actions || "")
                          .split("\n")
                          .filter(Boolean)
                          .map((a, i) => (
                            <li key={i} className="text-xs text-slate-600">
                              {a.replace(/^- /, "")}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!selected && eligibleCount > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6 text-center">
            <p className="text-sm font-semibold text-slate-900 mb-1">
              {eligibleCount} idea{eligibleCount === 1 ? "" : "s"} ready to prioritize
            </p>
            <p className="text-xs text-slate-500">Hit &quot;Generate Roadmap&quot; above to get a quick-wins-vs-long-term view.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function RoadmapItemCard({ item }: { item: RoadmapItem }) {
  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-sm font-medium text-slate-800 mb-1">{item.projectName}</p>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tagCls(item.impact)}`}>Impact {item.impact}</span>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tagCls(item.effort)}`}>Effort {item.effort}</span>
      </div>
      {item.rationale && <p className="text-xs text-slate-500">{item.rationale}</p>}
    </div>
  );
}
