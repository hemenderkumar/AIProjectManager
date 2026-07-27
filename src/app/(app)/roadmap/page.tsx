"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { Loader2, Sparkles, Zap, Clock, AlertCircle, Send, MessageCircleQuestion, ArrowRight, ListChecks, FileText } from "lucide-react";

type EligibleIdea = { id: string; name: string; feasibilityScore: number; organizationId: string | null; organizationName: string | null };
type RoadmapSummary = { id: string; createdAt: string; createdBy: string | null; executiveSummary: string | null; itemCount: number };
type RoadmapItem = {
  id: string;
  projectId: string;
  projectName: string;
  organizationId: string | null;
  impact: string;
  effort: string;
  quickWin: boolean;
  rationale: string | null;
};
type RoadmapPhase = { id: string; label: string; focus: string | null; actions: string | null };
type RoadmapDetail = { id: string; createdAt: string; createdBy: string | null; executiveSummary: string | null; items: RoadmapItem[]; phases: RoadmapPhase[] };
type GroupSuggestion = { label: string; rationale: string; projectIds: string[]; projectNames: string[] };

function tagCls(level: string) {
  if (level === "HIGH") return "bg-rose-50 text-rose-700";
  if (level === "MEDIUM") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-emerald-700";
}

function scoreCls(score: number) {
  if (score >= 70) return "bg-emerald-50 text-emerald-700";
  if (score >= 40) return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export default function RoadmapPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<RoadmapSummary[]>([]);
  const [eligibleIdeas, setEligibleIdeas] = useState<EligibleIdea[]>([]);
  const [canGenerate, setCanGenerate] = useState(false);
  // Gates the "Draft RFP" shortcut on each roadmap item -- same SUPER_USER+ floor
  // /api/rfps requires, so the button is never shown to a role that would just get a 403.
  const [canDraftRfp, setCanDraftRfp] = useState(false);
  const [selected, setSelected] = useState<RoadmapDetail | null>(null);
  // Which eligible ideas to actually include the next time "Generate Roadmap" runs -- lets
  // someone build a roadmap for a single idea, or any hand-picked combination, instead of
  // always every eligible idea at once. Defaults to "everything" on first load (the common
  // case), then only reconciles against ideas that disappear (score cleared, stage advanced)
  // rather than resetting a selection the user deliberately narrowed down.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const initializedSelection = useRef(false);
  // Simulated progress -- there's no server-sent progress event for a single AI call, so this
  // eases toward 90% over the AI generation's typical duration and only snaps to 100% once the
  // response actually lands, rather than pretending to know real completion percentage.
  const [progress, setProgress] = useState(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // AI-suggested groupings of the eligible ideas -- which ones belong in one roadmap together
  // vs. which are unrelated and should get their own. Purely a starting point for the checklist
  // below: applying a suggestion just sets selectedIds, it doesn't generate anything by itself.
  const [groupSuggestions, setGroupSuggestions] = useState<GroupSuggestion[] | null>(null);
  const [suggestingGroups, setSuggestingGroups] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/roadmap");
    if (res.ok) {
      const data = await res.json();
      setSummaries(data.roadmaps || []);
      const ideas: EligibleIdea[] = data.eligibleIdeas || [];
      setEligibleIdeas(ideas);
      const ids = new Set(ideas.map((i) => i.id));
      if (!initializedSelection.current) {
        setSelectedIds(ids);
        initializedSelection.current = true;
      } else {
        setSelectedIds((prev) => new Set([...prev].filter((id) => ids.has(id))));
      }
      setCanGenerate(!!data.canGenerate);
      setCanDraftRfp(!!data.canDraftRfp);
      if (data.roadmaps?.[0]) {
        const detailRes = await fetch(`/api/roadmap/${data.roadmaps[0].id}`);
        if (detailRes.ok) setSelected((await detailRes.json()).roadmap);
      }
    }
    setLoading(false);
  }, []);

  function toggleIdea(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function suggestGroups() {
    setSuggestingGroups(true);
    setGroupError(null);
    try {
      const res = await fetch("/api/ai/roadmap-groups");
      const data = await res.json();
      if (!res.ok) {
        setGroupError(data.error || "Couldn't suggest groupings.");
        return;
      }
      setGroupSuggestions(data.groups || []);
    } finally {
      setSuggestingGroups(false);
    }
  }

  function applyGroup(ids: string[]) {
    setSelectedIds(new Set(ids));
  }

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
      const res = await fetch("/api/ai/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectIds: Array.from(selectedIds) }),
      });
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
              disabled={generating || selectedIds.size === 0}
              title={selectedIds.size === 0 ? "Select at least one idea below first" : undefined}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent-600 text-white shadow-sm shadow-accent-600/20 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {generating ? "Generating..." : selectedIds.size > 0 ? `Generate Roadmap (${selectedIds.size})` : "Generate Roadmap"}
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

        {eligibleIdeas.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
            <p className="text-sm font-semibold text-slate-900 mb-1 text-center">
              {selected ? "Nothing new to prioritize yet" : "Nothing to prioritize yet"}
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto text-center mb-4">
              An idea only shows up here once it has a Feasibility score. Here&apos;s how to get one:
            </p>
            <ol className="max-w-md mx-auto space-y-2.5 mb-4">
              <li className="flex gap-2.5 text-xs text-slate-600">
                <span className="shrink-0 h-5 w-5 rounded-full bg-accent-50 text-accent-700 font-semibold flex items-center justify-center">1</span>
                <span>Open an idea from <Link href="/ideation" className="text-accent-600 hover:text-accent-700 font-medium">Ideation</Link> (or create one) and fill in its <strong>Idea &amp; Alignment</strong> sub-tab.</span>
              </li>
              <li className="flex gap-2.5 text-xs text-slate-600">
                <span className="shrink-0 h-5 w-5 rounded-full bg-accent-50 text-accent-700 font-semibold flex items-center justify-center">2</span>
                <span>Get it past that gate: invite reviewers to approve it, or, if you&apos;re a SUPER_USER/ADMIN, use the <strong>Override &amp; advance</strong> control to skip ahead.</span>
              </li>
              <li className="flex gap-2.5 text-xs text-slate-600">
                <span className="shrink-0 h-5 w-5 rounded-full bg-accent-50 text-accent-700 font-semibold flex items-center justify-center">3</span>
                <span>On the <strong>Technical Feasibility</strong> sub-tab, click <strong>Assess with AI</strong> (or type a score in yourself) and Save.</span>
              </li>
              <li className="flex gap-2.5 text-xs text-slate-600">
                <span className="shrink-0 h-5 w-5 rounded-full bg-accent-50 text-accent-700 font-semibold flex items-center justify-center">4</span>
                <span>Come back here — that idea is now eligible for the roadmap.</span>
              </li>
            </ol>
            <div className="text-center">
              <Link
                href="/ideation"
                className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent-50 text-accent-700 hover:bg-accent-100"
              >
                Go to Ideation <ArrowRight size={13} />
              </Link>
            </div>
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
                    <RoadmapItemCard key={it.id} item={it} canDraftRfp={canDraftRfp} onDrafted={(rfpId) => router.push(`/vendor-evaluation/${rfpId}`)} />
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
                    <RoadmapItemCard key={it.id} item={it} canDraftRfp={canDraftRfp} onDrafted={(rfpId) => router.push(`/vendor-evaluation/${rfpId}`)} />
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

        {eligibleIdeas.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ListChecks size={16} className="text-accent-600" />
                <p className="text-sm font-semibold text-slate-900">
                  {selected ? "Build another roadmap" : `${eligibleIdeas.length} idea${eligibleIdeas.length === 1 ? "" : "s"} ready to prioritize`}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium">
                <button
                  onClick={() => setSelectedIds(new Set(eligibleIdeas.map((i) => i.id)))}
                  className="text-accent-600 hover:text-accent-700"
                >
                  Select all
                </button>
                <span className="text-slate-300">|</span>
                <button onClick={() => setSelectedIds(new Set())} className="text-slate-500 hover:text-slate-700">
                  Clear all
                </button>
              </div>
            </div>
            <p className="px-5 pt-3 text-xs text-slate-500">
              Check one idea to build a roadmap for it alone, or combine several — uncheck the rest. Every
              combination you generate is saved, so you can build as many roadmaps as you have relevant
              groupings of ideas.
            </p>

            <div className="px-5 pt-3">
              <button
                onClick={suggestGroups}
                disabled={suggestingGroups || eligibleIdeas.length < 2}
                title={eligibleIdeas.length < 2 ? "Need at least two eligible ideas to suggest groupings" : undefined}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-700 hover:bg-accent-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {suggestingGroups ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {suggestingGroups ? "Thinking..." : "Suggest groupings with AI"}
              </button>
              {groupError && (
                <p className="text-xs text-rose-600 mt-2 flex items-center gap-1.5">
                  <AlertCircle size={13} className="shrink-0" /> {groupError}
                </p>
              )}
            </div>

            {groupSuggestions && (
              <div className="px-5 pt-3 space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  Suggested roadmaps ({groupSuggestions.length})
                </p>
                {groupSuggestions.map((g, i) => {
                  const isApplied =
                    g.projectIds.length === selectedIds.size && g.projectIds.every((id) => selectedIds.has(id));
                  return (
                    <div key={i} className="rounded-lg border border-slate-100 p-3 bg-slate-50/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">{g.label}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{g.projectNames.join(", ")}</p>
                          {g.rationale && <p className="text-xs text-slate-400 mt-1">{g.rationale}</p>}
                        </div>
                        <button
                          onClick={() => applyGroup(g.projectIds)}
                          className={`shrink-0 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors ${
                            isApplied ? "bg-emerald-50 text-emerald-700" : "bg-accent-600 text-white hover:bg-accent-700"
                          }`}
                        >
                          {isApplied ? "Selected" : "Use this group"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <ul className="divide-y divide-slate-50 mt-3">
              {eligibleIdeas.map((idea) => (
                <li key={idea.id}>
                  <label className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(idea.id)}
                      onChange={() => toggleIdea(idea.id)}
                      className="size-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-900 truncate">{idea.name}</span>
                      {idea.organizationName && <span className="block text-xs text-slate-400">{idea.organizationName}</span>}
                    </span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${scoreCls(idea.feasibilityScore)}`}>
                      {idea.feasibilityScore}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
              <p className="text-xs text-slate-500">Hit &quot;Generate Roadmap&quot; above to get a quick-wins-vs-long-term view for the checked ideas.</p>
            </div>
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

function RoadmapItemCard({
  item,
  canDraftRfp,
  onDrafted,
}: {
  item: RoadmapItem;
  canDraftRfp: boolean;
  onDrafted: (rfpId: string) => void;
}) {
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  async function draftRfp() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(`/api/roadmap/items/${item.id}/draft-rfp`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDraftError(data?.error ?? "Couldn't draft an RFP for this idea.");
        return;
      }
      onDrafted(data.rfpId);
    } finally {
      setDrafting(false);
    }
  }

  // Only offered once the idea belongs to an actual company -- an RFP is always filed under
  // an organizationId (see rfps.organizationId), so an internal-only idea has nowhere for one
  // to go.
  const showButton = canDraftRfp && item.organizationId != null;

  return (
    <div className="rounded-lg border border-slate-100 p-3">
      <p className="text-sm font-medium text-slate-800 mb-1">{item.projectName}</p>
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tagCls(item.impact)}`}>Impact {item.impact}</span>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tagCls(item.effort)}`}>Effort {item.effort}</span>
      </div>
      {item.rationale && <p className="text-xs text-slate-500 mb-1.5">{item.rationale}</p>}
      {showButton && (
        <button
          onClick={draftRfp}
          disabled={drafting}
          className="flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-lg bg-accent-50 text-accent-700 hover:bg-accent-100 disabled:opacity-50"
        >
          {drafting ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
          {drafting ? "Drafting..." : "Draft RFP"}
        </button>
      )}
      {draftError && <p className="text-[11px] text-rose-600 mt-1">{draftError}</p>}
    </div>
  );
}
