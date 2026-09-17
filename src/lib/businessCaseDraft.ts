import { askClaudeJSON } from "@/lib/ai";

type BusinessCaseDraftResponse = {
  executiveSummary: string;
  businessCase: string;
  swotStrengths: string[];
  swotWeaknesses: string[];
  swotOpportunities: string[];
  swotThreats: string[];
  marketAnalysis: string;
  marketPrediction: string;
  competitiveDifferentiation: string[];
  revenueProjections: string;
  roadmap: string;
};

export type BusinessCaseDraftInput = {
  name: string;
  ideaType?: string | null;
  ideaCategory?: string | null;
  problemStatement?: string | null;
  proposedSolution?: string | null;
  expectedBenefits?: string | null;
  feasibilityNotes?: string | null;
  feasibilityScore?: number | null;
  buildInfrastructureNeeds?: string | null;
  currentTechLandscape?: string | null;
  recommendedTechnology?: string | null;
  quotedUnitPrice?: number | null;
  targetMarginPercent?: number | null;
  targetMonthlyVolume?: number | null;
  materialCostEstimate?: number | null;
  budgetPlanned?: number | null;
};

export type BusinessCaseFields = {
  businessCaseExecutiveSummary: string;
  businessCase: string;
  swotStrengths: string;
  swotWeaknesses: string;
  swotOpportunities: string;
  swotThreats: string;
  marketAnalysis: string;
  marketPrediction: string;
  competitiveDifferentiation: string;
  revenueProjections: string;
  businessRoadmap: string;
};

const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

// Shared by /api/ai/business-case-draft (manual "Generate"/"Regenerate" in the Business Case /
// "Financial Forecast & Projections" tab) and the project-creation route (auto-draft a first
// pass the moment an idea with a problem/solution is created -- see api/projects POST). Same
// discipline throughout: ground everything ONLY in the facts given, never invent real
// competitor names, market-size statistics, or a revenue figure that isn't arithmetically
// derived from quotedUnitPrice x targetMonthlyVolume. Quantified market sizing (TAM/SAM/SOM)
// is deliberately NOT drafted here -- those are PM-entered numbers grounded in the team's own
// research (see marketSizeTam/Sam/Som on the project), never an AI guess.
export async function draftBusinessCase(p: BusinessCaseDraftInput): Promise<{ data: BusinessCaseFields | null; error?: string }> {
  const system = `You are drafting the BUSINESS CASE for a new idea/product -- the investor/funding-committee-
facing document that answers "should we fund this and why," reviewed BEFORE the formal Project Charter (which
covers scope/cost/execution once approved). Write it to actually persuade a funding decision-maker, not just
describe the idea: be concrete, quantify wherever the given facts allow it, and lead with the strongest point
in each section. Ground every section ONLY in the facts given below. Do NOT invent real competitor names, cite
real-world market-size statistics or industry reports you don't have access to, or state a dollar revenue
figure that isn't arithmetically derived from the quoted unit price and target monthly volume given below. If
pricing/volume aren't set, write qualitative directional projections only and say so explicitly rather than
inventing numbers. Market analysis and prediction should reason about the *category and dynamics implied by
the problem/solution* (competitive pressure, substitutes, timing) in general terms -- not fabricated specific
market-share or company data. Some fields below may be blank (e.g. this is a brand-new idea with no
feasibility/pricing work done yet) -- write the best first-pass reasoning you can from what IS given; it's
expected to be refined and regenerated later as more is captured.

Respond as JSON:
{
  "executiveSummary": string (3-5 sentences, the top-of-deck synthesis a busy decision-maker reads first:
    the opportunity in one line, why this solution wins, the funding ask if an implementation budget is
    given below (otherwise say the ask is still being scoped), and the expected payoff -- written to stand
    on its own even if nothing else in the deck gets read),
  "businessCase": string (2-4 sentences: why this problem is worth solving and why this solution wins),
  "swotStrengths": string[] (2-4 items, internal advantages of this specific idea/approach),
  "swotWeaknesses": string[] (2-4 items, internal gaps/risks of this specific idea/approach),
  "swotOpportunities": string[] (2-4 items, external factors this idea could exploit),
  "swotThreats": string[] (2-4 items, external factors that could hurt this idea),
  "marketAnalysis": string (2-4 sentences: who the buyer is, what alternatives they use today, why now),
  "marketPrediction": string (2-3 sentences: how this space is likely to evolve over the next 1-3 years, framed as reasoning not fact),
  "competitiveDifferentiation": string[] (2-4 items, direct "why this wins vs. the realistic alternative" points
    -- the status quo, a generic in-house workaround, or the category of existing options implied by the
    problem/solution given. Do NOT name real companies or products unless one is explicitly given below;
    describe alternatives by what they are/do, not who sells them),
  "revenueProjections": string (2-4 sentences; if quotedUnitPrice and targetMonthlyVolume are both given, show
    the arithmetic explicitly -- e.g. monthly revenue = price x volume, then a directional 3-scenario view
    (conservative/base/stretch) built off that; if either is missing, say projections require setting a
    quoted price and target volume first, and give only qualitative reasoning),
  "roadmap": string (3-5 short sequenced steps from here to launch, quick wins vs. longer-term, grounded in
    the feasibility/build notes given below -- not a generic template)
}`;

  const user = `Project: ${p.name}
Idea type: ${p.ideaType || "(not set)"} | Idea category: ${p.ideaCategory || "(not set)"}
Problem statement: ${p.problemStatement || "(not captured)"}
Proposed solution: ${p.proposedSolution || "(not captured)"}
Expected benefits: ${p.expectedBenefits || "(not captured)"}
Feasibility notes: ${p.feasibilityNotes || "(not captured)"}
Feasibility score: ${p.feasibilityScore != null ? `${p.feasibilityScore}/100` : "(not scored)"}
Build/infrastructure needs: ${p.buildInfrastructureNeeds || p.currentTechLandscape || "(not captured)"}
Recommended technology/approach: ${p.recommendedTechnology || "(not captured)"}
Quoted unit price: ${p.quotedUnitPrice != null ? `$${p.quotedUnitPrice}` : "(not set)"}
Target margin: ${p.targetMarginPercent != null ? `${p.targetMarginPercent}%` : "(not set)"}
Target monthly volume: ${p.targetMonthlyVolume != null ? `${p.targetMonthlyVolume} units/month` : "(not set)"}
Material cost estimate: ${p.materialCostEstimate != null ? `$${p.materialCostEstimate}` : "(not set)"}
Implementation budget: ${p.budgetPlanned != null ? `$${p.budgetPlanned}` : "(not set)"}`;

  const { data, error } = await askClaudeJSON<BusinessCaseDraftResponse>(system, user, 2500);
  if (error || !data) return { data: null, error: error || "No response from the AI model" };

  return {
    data: {
      businessCaseExecutiveSummary: data.executiveSummary,
      businessCase: data.businessCase,
      swotStrengths: bullets(data.swotStrengths || []),
      swotWeaknesses: bullets(data.swotWeaknesses || []),
      swotOpportunities: bullets(data.swotOpportunities || []),
      swotThreats: bullets(data.swotThreats || []),
      marketAnalysis: data.marketAnalysis,
      marketPrediction: data.marketPrediction,
      competitiveDifferentiation: bullets(data.competitiveDifferentiation || []),
      revenueProjections: data.revenueProjections,
      businessRoadmap: data.roadmap,
    },
  };
}
