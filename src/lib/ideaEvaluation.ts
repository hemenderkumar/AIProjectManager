// Pure logic for the Idea Evaluation hub (no db / network imports, unit-testable): the cost
// roll-up, the readiness checklist, decision validation, and normalising AI research output.

export type IdeaResearchSource = { title: string; url: string };
export type IdeaCompetitor = { name: string; what: string; pricing?: string };
export type IdeaResearchData = {
  summary: string;
  marketSize: string;
  trends: string[];
  competitors: IdeaCompetitor[];
  customers: string;
  positioning: string;
  risks: string[];
  sources: IdeaResearchSource[];
  webSearched: boolean; // false = written from model knowledge only, no live sources
  focus?: string | null;
};

// Web-search answers come back with <cite index="..."> wrappers; strip them (keeping the text
// inside) so they never reach the UI or the deck.
export function stripCitations(t: string): string {
  return t.replace(/<\/?cite[^>]*>/gi, "").replace(/\s{2,}/g, " ");
}
const str = (v: unknown, max = 1200) => (typeof v === "string" ? stripCitations(v).trim().slice(0, max) : "");
const strList = (v: unknown, maxItems = 8, maxLen = 400) =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];

export function isSafeHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

export function dedupeSources(list: IdeaResearchSource[], max = 12): IdeaResearchSource[] {
  const seen = new Set<string>();
  const out: IdeaResearchSource[] = [];
  for (const s of list) {
    if (!s?.url || !isSafeHttpUrl(s.url)) continue;
    const key = s.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: str(s.title, 160) || new URL(s.url).hostname, url: s.url });
    if (out.length >= max) break;
  }
  return out;
}

// Coerces whatever JSON the model returned into the stored shape; never trusts field types.
export function normalizeResearch(raw: unknown, sources: IdeaResearchSource[], webSearched: boolean, focus?: string | null): IdeaResearchData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const competitors: IdeaCompetitor[] = Array.isArray(r.competitors)
    ? (r.competitors as unknown[])
        .map((c): IdeaCompetitor | null => {
          const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
          const name = str(o.name, 80);
          return name ? { name, what: str(o.what, 300), pricing: str(o.pricing, 120) || undefined } : null;
        })
        .filter((c): c is IdeaCompetitor => c !== null)
        .slice(0, 8)
    : [];
  return {
    summary: str(r.summary, 1500),
    marketSize: str(r.marketSize, 600),
    trends: strList(r.trends),
    competitors,
    customers: str(r.customers, 600),
    positioning: str(r.positioning, 800),
    risks: strList(r.risks),
    sources: dedupeSources(sources),
    webSearched,
    focus: focus ? str(focus, 200) : null,
  };
}

// ---- total cost -------------------------------------------------------------------------
export type CostItemLike = { category: string; name: string; amount: number; isRecurring?: boolean | null; cadence?: string | null };
export type IdeaCostInput = {
  items: CostItemLike[];
  materialCostEstimate?: number | null;
  laborCostEstimate?: number | null;
  budgetPlanned?: number | null; // implementation budget
  ongoingSupportMonthlyCost?: number | null;
  contingencyPercent?: number | null;
  totalFundingRequired?: number | null;
};
export type IdeaCostSummary = {
  materials: number;
  labor: number;
  implementation: number;
  licenses: number; // informational: portion of the above that looks like licences/subscriptions
  oneTimeSubtotal: number;
  contingency: number;
  oneTimeTotal: number;
  ongoingAnnual: number;
  firstYearTotal: number;
  fundingRequired: number | null; // what the sponsor typed, if any, shown next to the computed one
};

const LICENSE_RE = /licen[sc]e|subscription|saas|software|seat/i;
const sum = (xs: number[]) => xs.reduce((s, x) => s + (Number.isFinite(x) ? x : 0), 0);

export function computeIdeaCost(i: IdeaCostInput): IdeaCostSummary {
  const by = (cat: string) => i.items.filter((c) => c.category === cat && !c.isRecurring);
  const itemsSum = (cat: string) => sum(by(cat).map((c) => c.amount));
  // Itemised rows win when present; otherwise fall back to the Charter's top-line figures.
  const materials = itemsSum("MATERIAL") || i.materialCostEstimate || 0;
  const labor = itemsSum("LABOR") || i.laborCostEstimate || 0;
  const implementation = itemsSum("IMPLEMENTATION") || i.budgetPlanned || 0;
  const licenses = sum(i.items.filter((c) => c.category !== "ONGOING_SUPPORT" && !c.isRecurring && LICENSE_RE.test(c.name)).map((c) => c.amount));
  const oneTimeSubtotal = materials + labor + implementation;
  const contingency = oneTimeSubtotal * ((i.contingencyPercent ?? 0) / 100);
  const oneTimeTotal = oneTimeSubtotal + contingency;
  // Recurring rows are monthly unless their cadence says annual/yearly.
  const recurringMonthly = sum(
    i.items.filter((c) => c.category === "ONGOING_SUPPORT" || c.isRecurring).map((c) => (/annual|year/i.test(c.cadence ?? "") ? c.amount / 12 : c.amount)),
  );
  const ongoingAnnual = (recurringMonthly || i.ongoingSupportMonthlyCost || 0) * 12;
  return {
    materials, labor, implementation, licenses, oneTimeSubtotal,
    contingency, oneTimeTotal, ongoingAnnual,
    firstYearTotal: oneTimeTotal + ongoingAnnual,
    fundingRequired: i.totalFundingRequired ?? null,
  };
}

// ---- readiness checklist ----------------------------------------------------------------
export type ReadinessInput = {
  problemStatement?: string | null;
  proposedSolution?: string | null;
  expectedBenefits?: string | null;
  feasibilityScore?: number | null;
  feasibilityNotes?: string | null;
  cost: IdeaCostSummary;
  researched: boolean;
  recommended?: boolean;
  askDecisionNeeded?: string | null;
  totalFundingRequired?: number | null;
};
export type ReadinessItem = { key: string; label: string; done: boolean; hint: string };

export function ideaReadiness(i: ReadinessInput): { items: ReadinessItem[]; doneCount: number; total: number; ready: boolean } {
  const has = (s?: string | null) => !!s?.trim();
  const items: ReadinessItem[] = [
    { key: "problem", label: "Problem is described", done: has(i.problemStatement), hint: "Who has the problem, and what it costs them today." },
    { key: "solution", label: "Solution and benefits", done: has(i.proposedSolution) && has(i.expectedBenefits), hint: "What you'll build or do, and what improves." },
    { key: "feasibility", label: "Feasibility checked", done: i.feasibilityScore != null || has(i.feasibilityNotes), hint: "Can it be done with the people, tech and materials available?" },
    { key: "cost", label: "Total cost estimated", done: i.cost.oneTimeTotal > 0 || i.cost.ongoingAnnual > 0, hint: "Materials, labour, licences, implementation and ongoing support." },
    { key: "research", label: "Market research done", done: i.researched, hint: "Competitors, market size and positioning, with sources." },
    { key: "recommendation", label: "Recommendation made", done: !!i.recommended, hint: "A clear proceed / don't proceed call, with the reasons for and against." },
    { key: "ask", label: "The ask is clear", done: has(i.askDecisionNeeded) && ((i.totalFundingRequired ?? 0) > 0 || i.cost.oneTimeTotal > 0), hint: "What decision and how much funding you need." },
  ];
  const doneCount = items.filter((x) => x.done).length;
  return { items, doneCount, total: items.length, ready: doneCount === items.length };
}

// ---- decision ---------------------------------------------------------------------------
export const IDEA_DECISIONS = ["GO", "PARK", "STOP"] as const;
export type IdeaDecision = (typeof IDEA_DECISIONS)[number];

export function validateIdeaDecision(decision: unknown, note: unknown): { ok: true; decision: IdeaDecision; note: string } | { ok: false; error: string } {
  if (typeof decision !== "string" || !IDEA_DECISIONS.includes(decision as IdeaDecision)) {
    return { ok: false, error: "decision must be GO, PARK or STOP" };
  }
  const text = typeof note === "string" ? note.trim() : "";
  if (text.length > 3000) return { ok: false, error: "Note is too long (max 3000 characters)" };
  if (decision !== "GO" && !text) return { ok: false, error: "Please add a short reason for parking or stopping this idea" };
  return { ok: true, decision: decision as IdeaDecision, note: text };
}

// Fields the idea chat helper is allowed to propose changes to (all are also in the project
// PATCH whitelist; the PATCH route stays the source of truth for permissions).
export const IDEA_CHAT_FIELDS: Record<string, { label: string; kind: "text" | "number" }> = {
  problemStatement: { label: "Problem statement", kind: "text" },
  proposedSolution: { label: "Proposed solution", kind: "text" },
  expectedBenefits: { label: "Expected benefits", kind: "text" },
  askDecisionNeeded: { label: "Decision needed", kind: "text" },
  askTeam: { label: "Team / people needed", kind: "text" },
  askTimeline: { label: "Timeline", kind: "text" },
  askIfApproved: { label: "If approved", kind: "text" },
  askIfDeclined: { label: "If declined", kind: "text" },
  totalFundingRequired: { label: "Funding required ($)", kind: "number" },
  materialCostEstimate: { label: "Material cost ($)", kind: "number" },
  laborCostEstimate: { label: "Labour cost ($)", kind: "number" },
  budgetPlanned: { label: "Implementation budget ($)", kind: "number" },
  ongoingSupportMonthlyCost: { label: "Ongoing support ($/month)", kind: "number" },
  contingencyPercent: { label: "Contingency (%)", kind: "number" },
  feasibilityNotes: { label: "Feasibility notes", kind: "text" },
  feasibilityScore: { label: "Feasibility score (0-100)", kind: "number" },
  currentTechLandscape: { label: "Current tech landscape", kind: "text" },
  recommendedTechnology: { label: "Recommended technology", kind: "text" },
  buildMaterialsList: { label: "Materials / components", kind: "text" },
  buildInfrastructureNeeds: { label: "Infrastructure needs", kind: "text" },
  architectureProsCons: { label: "Architecture pros and cons", kind: "text" },
  highLevelArchitecture: { label: "High-level architecture", kind: "text" },
  marketAnalysis: { label: "Market analysis", kind: "text" },
  competitiveDifferentiation: { label: "Competitive differentiation", kind: "text" },
  businessCaseExecutiveSummary: { label: "Executive summary", kind: "text" },
};

// Keeps only whitelisted keys with correctly typed values from a model-proposed change set.
export function sanitizeChatChanges(raw: unknown, allowedKeys?: string[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const def = IDEA_CHAT_FIELDS[k];
    if (!def || (allowedKeys && !allowedKeys.includes(k))) continue;
    if (def.kind === "number") {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n >= 0) out[k] = n;
    } else if (typeof v === "string" && v.trim()) {
      out[k] = v.trim().slice(0, 6000);
    }
  }
  return out;
}

// ---- AI cost estimate ---------------------------------------------------------------------
export type EstimatedCostLine = { category: "MATERIAL" | "LABOR" | "IMPLEMENTATION" | "ONGOING_SUPPORT"; name: string; amount: number; notes: string | null };
const COST_CATEGORIES = ["MATERIAL", "LABOR", "IMPLEMENTATION", "ONGOING_SUPPORT"] as const;

// Coerces the model's estimate into valid cost lines: known categories only, positive finite
// amounts, bounded counts. Ongoing support amounts are per month.
export function normalizeCostEstimate(raw: unknown): EstimatedCostLine[] {
  const lines = (raw && typeof raw === "object" ? (raw as { lines?: unknown }).lines : null) ?? raw;
  if (!Array.isArray(lines)) return [];
  const out: EstimatedCostLine[] = [];
  for (const l of lines) {
    const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
    const category = typeof o.category === "string" ? (o.category.toUpperCase() as EstimatedCostLine["category"]) : null;
    const amount = typeof o.amount === "number" ? o.amount : Number(o.amount);
    const name = str(o.name, 100);
    if (!category || !(COST_CATEGORIES as readonly string[]).includes(category) || !name || !Number.isFinite(amount) || amount <= 0 || amount > 1e9) continue;
    out.push({ category, name, amount: Math.round(amount), notes: str(o.notes, 200) || null });
    if (out.length >= 24) break;
  }
  return out;
}

// ---- AI recommendation --------------------------------------------------------------------
export const RECOMMENDATION_VERDICTS = ["PROCEED", "PROCEED_WITH_CONDITIONS", "DO_NOT_PROCEED"] as const;
export type RecommendationVerdict = (typeof RECOMMENDATION_VERDICTS)[number];
export const VERDICT_LABELS: Record<RecommendationVerdict, string> = {
  PROCEED: "Recommended — take it forward",
  PROCEED_WITH_CONDITIONS: "Recommended with conditions",
  DO_NOT_PROCEED: "Not recommended at this stage",
};
export type IdeaRecommendation = {
  verdict: RecommendationVerdict;
  headline: string;
  whyYes: string[];
  whyNot: string[];
  conditions: string[];
  nextSteps: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  feasibilityScore: number | null;
  feasibilityRationale: string;
  gaps: string[]; // evidence the AI did not have, so the reader knows how far to trust it
  generatedAt: string;
};

// Coerces the model's JSON into the stored shape. Returns null if it isn't usable (no valid
// verdict, or no reasoning at all) so a bad response never shows as a confident verdict.
export function normalizeRecommendation(raw: unknown, now: Date = new Date()): IdeaRecommendation | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const verdict = typeof r.verdict === "string" ? (r.verdict.toUpperCase() as RecommendationVerdict) : null;
  if (!verdict || !(RECOMMENDATION_VERDICTS as readonly string[]).includes(verdict)) return null;
  const whyYes = strList(r.whyYes, 6, 300);
  const whyNot = strList(r.whyNot, 6, 300);
  if (!whyYes.length && !whyNot.length) return null;
  const score = typeof r.feasibilityScore === "number" ? r.feasibilityScore : Number(r.feasibilityScore);
  const conf = typeof r.confidence === "string" ? r.confidence.toUpperCase() : "";
  return {
    verdict,
    headline: str(r.headline, 300),
    whyYes, whyNot,
    conditions: strList(r.conditions, 6, 300),
    nextSteps: strList(r.nextSteps, 6, 250),
    confidence: conf === "HIGH" || conf === "LOW" ? conf : "MEDIUM",
    feasibilityScore: Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : null,
    feasibilityRationale: str(r.feasibilityRationale, 500),
    gaps: strList(r.gaps, 6, 200),
    generatedAt: now.toISOString(),
  };
}

// ---- plan: AI cost savings, partnerships, 3-year projection -------------------------------
export type CostSaving = { lever: string; how: string; appliesTo: EstimatedCostLine["category"]; estimatedSaving: number; risk: string };
export type Partnership = { partner: string; role: string; benefit: string; caution: string };
export type ProjectionInput = { revenue: [number, number, number]; variableCostPercent: number; assumptions: string[] };
export type IdeaPlan = {
  generatedAt: string;
  costAssumptions: string; // how the cost estimate was built (saved by the cost estimate step)
  savings: CostSaving[];
  partnerships: Partnership[];
  projection: ProjectionInput | null;
};

const CAT_KEYS: EstimatedCostLine["category"][] = ["MATERIAL", "LABOR", "IMPLEMENTATION", "ONGOING_SUPPORT"];
function categoryTotal(cost: IdeaCostSummary, c: EstimatedCostLine["category"]): number {
  return c === "MATERIAL" ? cost.materials : c === "LABOR" ? cost.labor : c === "IMPLEMENTATION" ? cost.implementation : cost.ongoingAnnual;
}

// Keeps the plan grounded: a saving must apply to a category that actually has cost and can't
// claim more than half of it; revenue must be three non-negative numbers.
export function normalizePlan(raw: unknown, cost: IdeaCostSummary, costAssumptions = "", now: Date = new Date()): IdeaPlan {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const savings: CostSaving[] = [];
  for (const x of Array.isArray(r.savings) ? r.savings : []) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const cat = typeof o.appliesTo === "string" ? (o.appliesTo.toUpperCase() as EstimatedCostLine["category"]) : null;
    const amt = typeof o.estimatedSaving === "number" ? o.estimatedSaving : Number(o.estimatedSaving);
    const lever = str(o.lever, 120);
    if (!cat || !CAT_KEYS.includes(cat) || !lever || !Number.isFinite(amt) || amt <= 0) continue;
    const base = categoryTotal(cost, cat);
    if (base <= 0) continue;
    savings.push({ lever, how: str(o.how, 300), appliesTo: cat, estimatedSaving: Math.round(Math.min(amt, base * 0.5)), risk: str(o.risk, 200) });
    if (savings.length >= 6) break;
  }
  const partnerships: Partnership[] = [];
  for (const x of Array.isArray(r.partnerships) ? r.partnerships : []) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const partner = str(o.partner, 120);
    if (!partner) continue;
    partnerships.push({ partner, role: str(o.role, 200), benefit: str(o.benefit, 250), caution: str(o.caution, 200) });
    if (partnerships.length >= 5) break;
  }
  let projection: ProjectionInput | null = null;
  const pr = (r.projection && typeof r.projection === "object" ? r.projection : null) as Record<string, unknown> | null;
  if (pr && Array.isArray(pr.revenue) && pr.revenue.length >= 3) {
    const rev = pr.revenue.slice(0, 3).map((v) => (typeof v === "number" ? v : Number(v)));
    if (rev.every((v) => Number.isFinite(v) && v >= 0 && v < 1e11)) {
      const vp = typeof pr.variableCostPercent === "number" ? pr.variableCostPercent : Number(pr.variableCostPercent);
      projection = {
        revenue: [Math.round(rev[0]), Math.round(rev[1]), Math.round(rev[2])],
        variableCostPercent: Number.isFinite(vp) ? Math.min(70, Math.max(0, vp)) : 0,
        assumptions: strList(pr.assumptions, 6, 250),
      };
    }
  }
  return { generatedAt: now.toISOString(), costAssumptions, savings, partnerships, projection };
}

export type ProjectionYear = { year: 1 | 2 | 3; revenue: number; cost: number; net: number; cumulative: number };
// Year 1 carries the one-time investment plus a year of running cost; later years carry running
// cost only. Variable cost (hosting/COGS that scales with sales) is a % of that year's revenue.
export function computeProjection(cost: IdeaCostSummary, p: ProjectionInput): { years: ProjectionYear[]; breakEvenYear: number | null } {
  let cumulative = 0;
  const years = ([1, 2, 3] as const).map((year, idx) => {
    const revenue = p.revenue[idx];
    const c = (year === 1 ? cost.oneTimeTotal : 0) + cost.ongoingAnnual + revenue * (p.variableCostPercent / 100);
    const net = revenue - c;
    cumulative += net;
    return { year, revenue, cost: Math.round(c), net: Math.round(net), cumulative: Math.round(cumulative) };
  });
  return { years, breakEvenYear: years.find((y) => y.cumulative >= 0)?.year ?? null };
}

export function totalSavings(plan: IdeaPlan | null): number {
  return plan ? plan.savings.reduce((s, x) => s + x.estimatedSaving, 0) : 0;
}
