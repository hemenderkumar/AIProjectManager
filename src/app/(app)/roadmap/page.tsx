"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import Topbar from "@/components/Topbar";
import { Loader2, Sparkles, Zap, Clock, AlertCircle, Send, MessageCircleQuestion } from "lucide-react";

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
  // Simulated progress -- there's no server-sent progress event for a single AI call, so this
  // eases toward 90% over the AI generation's typical duration and only snaps to 100% once the
  // response actually lands, rather than pretending to know real completion percentage.
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setProgress(6);
    progressTimer.current = setInterval(() => {
      // Slows down as it climbs so it never visibly "finishes" before the real response --
      // fast at first (early feedback that something is happening), crawling near 90%.
      setProgress((p) => (p < 90 ? p + Math.max(1, (90 - p) * 0.08) : p));
    }, 400);
    try {
      const res = await fetch("/api/ai/roadmap", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't generate a roadmap");
        return;
      }
      setProgress(100);
      setSelected(data.roadmap);
      await loadList();
    } finally {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setTimeout(() => setProgress(0), 500);
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
      {progress > 0 && (
        <div className="h-1 bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-accent-600 transition-[width] duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
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

            <RoadmapChat roadmapId={selected.id} />
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

type ChatMsg = { role: "user" | "assistant"; text: string };

// Read-only Q&A grounded in the currently selected roadmap -- helps someone reason through the
// plan ("why is this a quick win", "what should I start first") without pretending to edit or
// regenerate it (see api/ai/roadmap-chat's system prompt for that same constraint server-side).
function RoadmapChat({ roadmapId }: { roadmapId: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  async function ask(q: string) {
    if (!q.trim() || asking) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setAsking(true);
    try {
      const res = await fetch("/api/ai/roadmap-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roadmapId, question: q }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: "assistant", text: data.answer ?? data.error ?? "I couldn't find an answer for that." }]);
    } finally {
      setAsking(false);
    }
  }

  const starters = ["What should I start immediately?", "Why are these quick wins?", "What's the biggest risk in this plan?"];

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircleQuestion size={16} className="text-accent-600" />
        <p className="text-sm font-semibold text-slate-900">Ask about this roadmap</p>
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {starters.map((s) => (
            <button
              key={s}
              onClick={() => ask(s)}
              className="text-xs px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="space-y-3 mb-3 max-h-72 overflow-y-auto scrollbar-thin">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block text-xs leading-relaxed rounded-lg px-3 py-2 max-w-[85%] text-left ${
                  m.role === "user" ? "bg-accent-50 text-accent-900" : "bg-slate-50 text-slate-700"
                }`}
              >
                {m.text}
              </span>
            </div>
          ))}
          {asking && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 size={12} className="animate-spin" /> Thinking...
            </div>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question about this roadmap..."
          className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
        <button
          type="submit"
          disabled={asking || !question.trim()}
          className="px-3 py-2 rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors disabled:opacity-50"
        >
          <Send size={15} />
        </button>
      </form>
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
