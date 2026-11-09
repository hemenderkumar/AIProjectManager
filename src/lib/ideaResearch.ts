// AI market research (live web search where available) and "the ask" drafting for the Idea
// Evaluation hub. The Anthropic SDK pinned here predates web-search types, so the research call
// goes through the REST API directly; if that fails for any reason we fall back to a plain
// model call and flag the result as unverified (webSearched=false) rather than failing.
import { AI_MODEL, askClaudeJSON } from "./ai";
import { normalizeResearch, type IdeaResearchData, type IdeaResearchSource } from "./ideaEvaluation";

export type IdeaBrief = {
  name: string;
  category?: string | null;
  problem?: string | null;
  solution?: string | null;
  benefits?: string | null;
  audience?: string | null;
  existingAnalysis?: string | null;
};

export function briefText(b: IdeaBrief): string {
  return [
    `Idea: ${b.name}`,
    b.category ? `Category: ${b.category}` : "",
    b.problem ? `Problem: ${b.problem}` : "",
    b.solution ? `Proposed solution: ${b.solution}` : "",
    b.benefits ? `Expected benefits: ${b.benefits}` : "",
    b.audience ? `Customers / users: ${b.audience}` : "",
    b.existingAnalysis ? `Existing notes: ${b.existingAnalysis}` : "",
  ].filter(Boolean).join("\n");
}

const RESEARCH_SYSTEM = `You are a market analyst helping a team decide whether an idea is worth pursuing.
Research the idea's market and reply with ONLY a JSON object (no markdown fences) shaped:
{"summary": "2-4 sentence overview", "marketSize": "size/growth with the year and source if found, else say it could not be verified",
"trends": ["3-5 short trends"], "competitors": [{"name": "", "what": "what they offer", "pricing": "if known"}],
"customers": "who buys and why", "positioning": "where this idea could sit versus competitors", "risks": ["3-5 market risks"]}
Only state figures you found in sources; say "unverified" rather than guessing. Never invent competitors.`;

type ContentBlock = {
  type: string;
  text?: string;
  citations?: { type?: string; url?: string; title?: string }[];
  content?: unknown;
};

async function researchWithWebSearch(prompt: string): Promise<{ raw: unknown; sources: IdeaResearchSource[] } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 50_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 3000,
        system: RESEARCH_SYSTEM,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { content?: ContentBlock[] };
    const blocks = json.content ?? [];
    const sources: IdeaResearchSource[] = [];
    let text = "";
    for (const b of blocks) {
      if (b.type === "text" && b.text) {
        text += b.text;
        for (const c of b.citations ?? []) if (c.url) sources.push({ title: c.title ?? "", url: c.url });
      } else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content as { url?: string; title?: string }[]) if (r?.url) sources.push({ title: r.title ?? "", url: r.url });
      }
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return { raw: JSON.parse(m[0]), sources };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function researchMarket(brief: IdeaBrief, focus?: string | null): Promise<{ data: IdeaResearchData | null; error?: string }> {
  const prompt = `${briefText(brief)}${focus ? `\n\nFocus this research on: ${focus}` : ""}`;
  const web = await researchWithWebSearch(prompt);
  if (web) {
    const data = normalizeResearch(web.raw, web.sources, web.sources.length > 0, focus);
    if (data.summary) return { data };
  }
  const { data, error } = await askClaudeJSON<unknown>(
    RESEARCH_SYSTEM + "\nNo live search is available: rely on general knowledge and mark every figure as unverified.",
    prompt, 2500, 0.3,
  );
  if (!data) return { data: null, error: error ?? "Research failed" };
  return { data: normalizeResearch(data, [], false, focus) };
}

export type DraftedAsk = {
  askDecisionNeeded: string; askTeam: string; askTimeline: string; askIfApproved: string; askIfDeclined: string;
};

export async function draftAsk(brief: IdeaBrief, costLine: string): Promise<{ data: DraftedAsk | null; error?: string }> {
  const system = `You help a sponsor write "The Ask" slide for an executive deck. Ground it ONLY in the facts given;
do not invent numbers. Reply with ONLY JSON: {"askDecisionNeeded": "the single decision requested, 1-2 sentences",
"askTeam": "people/skills needed", "askTimeline": "rough timeline to first value", "askIfApproved": "what happens next if yes",
"askIfDeclined": "what happens if no / the cost of doing nothing"}. Keep each under 40 words. Say "TBD" where unknown.`;
  const { data, error } = await askClaudeJSON<Record<string, unknown>>(system, `${briefText(brief)}\nCost: ${costLine}`, 800, 0.3);
  if (!data) return { data: null, error };
  const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 600) : "");
  return {
    data: {
      askDecisionNeeded: s(data.askDecisionNeeded), askTeam: s(data.askTeam), askTimeline: s(data.askTimeline),
      askIfApproved: s(data.askIfApproved), askIfDeclined: s(data.askIfDeclined),
    },
  };
}

// ---- cost estimate ----------------------------------------------------------------------
import { normalizeCostEstimate, type EstimatedCostLine } from "./ideaEvaluation";

export async function estimateIdeaCost(brief: IdeaBrief, context: string): Promise<{ lines: EstimatedCostLine[]; assumptions: string; error?: string }> {
  const system = `You are a pragmatic delivery lead producing an early, order-of-magnitude cost estimate for a proposed idea.
Break the cost into lines in these categories only:
- MATERIAL: hardware, equipment, physical materials, cloud/infrastructure setup (one-time)
- LABOR: people effort to design and build (one-time), e.g. "2 engineers x 4 months"
- IMPLEMENTATION: one-time delivery costs: third-party licences/subscriptions needed to build or launch (name them with "licence"), integrations, legal/compliance, testing, launch
- ONGOING_SUPPORT: recurring costs, amounts PER MONTH: hosting, licences, support staff, maintenance
Use realistic USD market rates. 6-14 lines total. Do not pad; every line must be needed for THIS idea.
Reply with ONLY JSON: {"lines":[{"category":"","name":"","amount":0,"notes":"basis for the number, 1 short sentence"}],"assumptions":"2-3 sentences: key assumptions and confidence"}`;
  const { data, error } = await askClaudeJSON<{ lines?: unknown; assumptions?: unknown }>(system, `${briefText(brief)}\n${context}`, 2500, 0.2);
  if (!data) return { lines: [], assumptions: "", error: error ?? "Cost estimate failed" };
  const lines = normalizeCostEstimate(data);
  if (!lines.length) return { lines: [], assumptions: "", error: "The AI didn't return usable cost lines — try again." };
  return { lines, assumptions: typeof data.assumptions === "string" ? data.assumptions.slice(0, 600) : "" };
}

// ---- recommendation ---------------------------------------------------------------------
import { normalizeRecommendation, type IdeaRecommendation } from "./ideaEvaluation";

export async function recommendIdea(brief: IdeaBrief, evidence: string): Promise<{ data: IdeaRecommendation | null; error?: string }> {
  const system = `You are a candid investment-committee analyst deciding whether an idea should be taken forward.
Weigh ONLY the evidence supplied. Be decisive and specific: every reason must point to a concrete fact from the evidence
(a cost figure, a competitor, a risk, a missing capability) -- no generic filler. Give BOTH the case for and the case against,
even when the verdict is clear. If key evidence is missing, say so under "gaps" and lower the confidence rather than guessing.
Verdicts: PROCEED (strong case, limited blockers), PROCEED_WITH_CONDITIONS (worth pursuing if the listed conditions are met),
DO_NOT_PROCEED (case is weak, too costly or too risky now -- say what would change your mind).
feasibilityScore is 0-100: confidence the team could deliver this with normal effort given the evidence (not a guess dressed as precision).
Reply with ONLY JSON: {"verdict":"","headline":"one sentence a CEO can act on","whyYes":["3-5 reasons to proceed"],"whyNot":["2-5 reasons for caution or against"],
"conditions":["what must be true / be done first; empty if PROCEED"],"nextSteps":["3-4 concrete next actions"],"confidence":"LOW|MEDIUM|HIGH",
"feasibilityScore":0,"feasibilityRationale":"1-2 sentences","gaps":["missing evidence"]}`;
  const { data, error } = await askClaudeJSON<unknown>(system, `${briefText(brief)}\n\nEVIDENCE\n${evidence}`, 2200, 0.2);
  if (!data) return { data: null, error };
  const rec = normalizeRecommendation(data);
  return rec ? { data: rec } : { data: null, error: "The AI didn't return a usable recommendation — try again." };
}
