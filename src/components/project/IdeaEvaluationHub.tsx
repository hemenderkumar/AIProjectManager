"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectDetail } from "./ProjectTabs";
import { Card, Field, inputCls, PrimaryButton } from "./ui";
import IdeaAiChat from "./IdeaAiChat";
import AiWaitIndicator from "@/components/AiWaitIndicator";
import { computeIdeaCost, ideaReadiness, type IdeaResearchData } from "@/lib/ideaEvaluation";
import { CheckCircle2, Circle, Sparkles, Loader2, Download, Search, ExternalLink, AlertTriangle } from "lucide-react";
import type { SessionUser } from "@/lib/auth";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const PM_ORDER = { VIEWER: 0, CONTRIBUTOR: 1, PM: 2, SUPER_USER: 3, ADMIN: 4 };

const DECISION_STYLE: Record<string, string> = {
  GO: "bg-emerald-50 text-emerald-700",
  PARK: "bg-amber-50 text-amber-700",
  STOP: "bg-rose-50 text-rose-700",
};

// The one place to take an idea from "a thought" to "a decision": readiness checklist, the
// ask, AI market research, total cost, the deck, and the go / park / stop call.
export default function IdeaEvaluationHub({ detail, user }: { detail: ProjectDetail; user: SessionUser | null }) {
  const router = useRouter();
  const p = detail.project;
  const research = (p.ideaResearch ?? null) as IdeaResearchData | null;
  const canDecide = !!user && PM_ORDER[user.role] >= PM_ORDER.PM;

  const cost = useMemo(() => computeIdeaCost({ items: detail.costItems, ...p }), [detail.costItems, p]);
  const ready = ideaReadiness({ ...p, cost, researched: !!research });
  const next = ready.items.find((i) => !i.done);

  const [ask, setAsk] = useState({
    askDecisionNeeded: p.askDecisionNeeded ?? "",
    askTeam: p.askTeam ?? "",
    askTimeline: p.askTimeline ?? "",
    askIfApproved: p.askIfApproved ?? "",
    askIfDeclined: p.askIfDeclined ?? "",
    totalFundingRequired: p.totalFundingRequired ?? 0,
  });
  const [askBusy, setAskBusy] = useState<"save" | "draft" | null>(null);
  const [askMsg, setAskMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [focus, setFocus] = useState("");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  const [decisionNote, setDecisionNote] = useState(p.ideaDecisionNote ?? "");
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function saveAsk() {
    setAskBusy("save");
    setAskMsg(null);
    const res = await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ask, totalFundingRequired: Number(ask.totalFundingRequired) || 0 }),
    });
    setAskBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAskMsg({ ok: false, text: data?.error ?? "Could not save — please try again." });
      return;
    }
    setAskMsg({ ok: true, text: "Saved." });
    router.refresh();
  }

  async function draftAsk() {
    setAskBusy("draft");
    setAskMsg(null);
    try {
      const res = await fetch("/api/ai/idea-ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setAskMsg({ ok: false, text: data?.error ?? "The AI couldn't draft the ask." });
      else {
        setAsk((a) => ({ ...a, ...data.ask }));
        setAskMsg({ ok: true, text: "Draft ready — review, edit, then save." });
      }
    } catch {
      setAskMsg({ ok: false, text: "Couldn't reach the server." });
    } finally {
      setAskBusy(null);
    }
  }

  async function runResearch() {
    setResearching(true);
    setResearchError(null);
    try {
      const res = await fetch("/api/ai/idea-research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id, focus: focus.trim() || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setResearchError(data?.error ?? "Research failed. Please try again.");
      else router.refresh();
    } catch {
      setResearchError("Couldn't reach the server (research can take up to a minute — try again).");
    } finally {
      setResearching(false);
    }
  }

  async function decide(decision: "GO" | "PARK" | "STOP") {
    setDeciding(decision);
    setDecisionError(null);
    const res = await fetch(`/api/projects/${p.id}/idea-decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note: decisionNote }) });
    setDeciding(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDecisionError(data?.error ?? "Could not record the decision.");
      return;
    }
    router.refresh();
  }

  async function downloadDeck() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`/api/projects/${p.id}/business-case-pptx`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDownloadError(data?.error ?? `Couldn't generate the deck (server returned ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(p.name || "idea").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "idea"}-evaluation-deck.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("Couldn't reach the server to generate the deck.");
    } finally {
      setDownloading(false);
    }
  }

  const costRows: [string, number][] = [
    ["Materials", cost.materials],
    ["Labour", cost.labor],
    ["Implementation", cost.implementation],
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <Card title={`Idea readiness — ${ready.doneCount} of ${ready.total}`}>
        <div className="h-2 rounded-full bg-slate-100 mb-4 overflow-hidden">
          <div className="h-full bg-accent-600 transition-all" style={{ width: `${(ready.doneCount / ready.total) * 100}%` }} />
        </div>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {ready.items.map((i) => (
            <li key={i.key} className="flex items-start gap-2 text-sm">
              {i.done ? <CheckCircle2 size={15} className="text-emerald-500 mt-0.5 shrink-0" /> : <Circle size={15} className="text-slate-300 mt-0.5 shrink-0" />}
              <span className={i.done ? "text-slate-700" : "text-slate-500"}>{i.label}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 mt-4">
          {next ? <>Next: <span className="font-medium text-slate-700">{next.label}</span> — {next.hint}</> : "Everything is in place. Download the deck and take the decision below."}
        </p>
        {p.ideaDecision && (
          <p className={`inline-block mt-3 text-xs font-semibold px-2.5 py-1 rounded-full ${DECISION_STYLE[p.ideaDecision] ?? "bg-slate-100 text-slate-700"}`}>
            Decision: {p.ideaDecision}{p.ideaDecidedBy ? ` by ${p.ideaDecidedBy}` : ""}
          </p>
        )}
      </Card>

      <Card title="The idea">
        <dl className="space-y-3 text-sm">
          {([["Problem addressed", p.problemStatement], ["Proposed solution", p.proposedSolution], ["Expected benefits", p.expectedBenefits]] as const).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-medium text-slate-500">{k}</dt>
              <dd className="text-slate-800 whitespace-pre-wrap">{v?.trim() || <span className="text-slate-400">Not written yet — add it in Idea &amp; Alignment, or ask the AI helper below.</span>}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card
        title="Market research"
        action={
          <button onClick={runResearch} disabled={researching} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50">
            {researching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {research ? "Re-run research" : "Run AI research"}
          </button>
        }
      >
        <input value={focus} onChange={(e) => setFocus(e.target.value)} className={`${inputCls} mb-3`} placeholder="Optional focus, e.g. “European competitors” or “pricing models”" maxLength={200} />
        <AiWaitIndicator active={researching} messages={["Searching the web…", "Reading competitor pages…", "Summarising the market…"]} />
        {researchError && <p className="text-xs text-rose-600 mb-2">{researchError}</p>}
        {!research && !researching && <p className="text-sm text-slate-500">No research yet. The AI will look at competitors, market size and trends, and cite its sources.</p>}
        {research && (
          <div className="space-y-3 text-sm text-slate-800">
            {!research.webSearched && (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> Written from the AI&apos;s general knowledge without live sources — verify figures before relying on them.
              </p>
            )}
            <p>{research.summary}</p>
            {research.marketSize && <p><span className="font-medium">Market size: </span>{research.marketSize}</p>}
            {research.positioning && <p><span className="font-medium">Positioning: </span>{research.positioning}</p>}
            {research.competitors.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Competitors</p>
                <ul className="space-y-1">
                  {research.competitors.map((c) => (
                    <li key={c.name}><span className="font-medium">{c.name}</span> — {c.what}{c.pricing ? ` (${c.pricing})` : ""}</li>
                  ))}
                </ul>
              </div>
            )}
            {research.risks.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Market risks</p>
                <ul className="list-disc pl-5 space-y-0.5">{research.risks.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
            {research.sources.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">Sources</p>
                <ul className="space-y-0.5">
                  {research.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-600 hover:underline inline-flex items-center gap-1">
                        {s.title} <ExternalLink size={11} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Total cost">
        <table className="w-full text-sm">
          <tbody>
            {costRows.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-100">
                <td className="py-1.5 text-slate-600">{k}</td>
                <td className="py-1.5 text-right tabular-nums">{money(v)}</td>
              </tr>
            ))}
            {cost.licenses > 0 && (
              <tr className="border-b border-slate-100">
                <td className="py-1.5 text-slate-400 pl-4 text-xs">of which licences / subscriptions</td>
                <td className="py-1.5 text-right tabular-nums text-xs text-slate-400">{money(cost.licenses)}</td>
              </tr>
            )}
            <tr className="border-b border-slate-100">
              <td className="py-1.5 text-slate-600">Contingency ({p.contingencyPercent ?? 0}%)</td>
              <td className="py-1.5 text-right tabular-nums">{money(cost.contingency)}</td>
            </tr>
            <tr className="border-b border-slate-100 font-medium">
              <td className="py-1.5">One-time total</td>
              <td className="py-1.5 text-right tabular-nums">{money(cost.oneTimeTotal)}</td>
            </tr>
            <tr className="border-b border-slate-100">
              <td className="py-1.5 text-slate-600">Ongoing support (per year)</td>
              <td className="py-1.5 text-right tabular-nums">{money(cost.ongoingAnnual)}</td>
            </tr>
            <tr className="font-semibold">
              <td className="py-2">First-year total</td>
              <td className="py-2 text-right tabular-nums">{money(cost.firstYearTotal)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-xs text-slate-400 mt-2">Built from the itemised cost lines (or the charter figures when none exist). Edit them in Scope &amp; Charter, or ask the AI helper to set them.</p>
      </Card>

      <Card
        title="The ask"
        action={
          <button onClick={draftAsk} disabled={askBusy !== null} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-accent-50 text-accent-600 hover:bg-accent-100 disabled:opacity-50">
            {askBusy === "draft" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Draft with AI
          </button>
        }
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Decision needed">
              <textarea rows={2} className={inputCls} value={ask.askDecisionNeeded} onChange={(e) => setAsk({ ...ask, askDecisionNeeded: e.target.value })} placeholder="e.g. Approve funding to build a 3-month pilot" />
            </Field>
          </div>
          <Field label="Funding requested ($)">
            <input type="number" min={0} className={inputCls} value={ask.totalFundingRequired} onChange={(e) => setAsk({ ...ask, totalFundingRequired: Number(e.target.value) })} />
          </Field>
          <Field label="Timeline">
            <input className={inputCls} value={ask.askTimeline} onChange={(e) => setAsk({ ...ask, askTimeline: e.target.value })} placeholder="e.g. Pilot live in 12 weeks" />
          </Field>
          <Field label="Team / people needed">
            <textarea rows={2} className={inputCls} value={ask.askTeam} onChange={(e) => setAsk({ ...ask, askTeam: e.target.value })} />
          </Field>
          <Field label="If approved">
            <textarea rows={2} className={inputCls} value={ask.askIfApproved} onChange={(e) => setAsk({ ...ask, askIfApproved: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="If declined">
              <textarea rows={2} className={inputCls} value={ask.askIfDeclined} onChange={(e) => setAsk({ ...ask, askIfDeclined: e.target.value })} />
            </Field>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <PrimaryButton onClick={saveAsk} disabled={askBusy !== null}>{askBusy === "save" ? "Saving…" : "Save the ask"}</PrimaryButton>
          {askMsg && <span className={`text-xs ${askMsg.ok ? "text-emerald-700" : "text-rose-600"}`}>{askMsg.text}</span>}
        </div>
      </Card>

      <Card title="Decision deck">
        <p className="text-sm text-slate-600 mb-3">A PowerPoint covering the problem, market research, feasibility, total cost, positioning and the ask.</p>
        <PrimaryButton onClick={downloadDeck} disabled={downloading} className="inline-flex items-center gap-1.5">
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download deck (.pptx)
        </PrimaryButton>
        {downloadError && <p className="text-xs text-rose-600 mt-2">{downloadError}</p>}
      </Card>

      <Card title="Go / park / stop">
        {canDecide ? (
          <>
            <Field label="Reason (required for park or stop)">
              <textarea rows={2} className={inputCls} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => decide("GO")} disabled={deciding !== null} className="px-3.5 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                {deciding === "GO" ? "Saving…" : "Go — move to Charter"}
              </button>
              <button onClick={() => decide("PARK")} disabled={deciding !== null} className="px-3.5 py-2 rounded-lg text-sm font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50">Park</button>
              <button onClick={() => decide("STOP")} disabled={deciding !== null} className="px-3.5 py-2 rounded-lg text-sm font-medium bg-rose-100 text-rose-800 hover:bg-rose-200 disabled:opacity-50">Stop</button>
            </div>
            {decisionError && <p className="text-xs text-rose-600 mt-2">{decisionError}</p>}
            {p.ideaDecision && p.ideaDecidedAt && (
              <p className="text-xs text-slate-400 mt-2">Last decision: {p.ideaDecision} by {p.ideaDecidedBy} on {new Date(p.ideaDecidedAt).toLocaleDateString("en-US")}.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">A project manager or above records the go / park / stop decision.{p.ideaDecision ? ` Current decision: ${p.ideaDecision}.` : ""}</p>
        )}
      </Card>

      <IdeaAiChat
        projectId={p.id}
        suggestions={["What's missing before I can take this to leadership?", "Draft the problem statement", "Draft the ask", "Estimate costs for materials, labour and licences"]}
      />
    </div>
  );
}
