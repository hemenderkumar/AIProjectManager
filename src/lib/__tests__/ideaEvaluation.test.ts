import { describe, it, expect } from "vitest";
import { computeIdeaCost, ideaReadiness, validateIdeaDecision, normalizeResearch, sanitizeChatChanges, dedupeSources } from "../ideaEvaluation";

describe("computeIdeaCost", () => {
  it("prefers itemised rows, falls back to charter figures, and rolls up first year", () => {
    const c = computeIdeaCost({
      items: [
        { category: "MATERIAL", name: "Sensors", amount: 1000 },
        { category: "IMPLEMENTATION", name: "SaaS licence", amount: 500 },
        { category: "ONGOING_SUPPORT", name: "Support", amount: 100, isRecurring: true },
      ],
      laborCostEstimate: 2000, contingencyPercent: 10,
    });
    expect(c.materials).toBe(1000);
    expect(c.labor).toBe(2000);
    expect(c.implementation).toBe(500);
    expect(c.licenses).toBe(500);
    expect(c.oneTimeTotal).toBeCloseTo(3850);
    expect(c.ongoingAnnual).toBe(1200);
    expect(c.firstYearTotal).toBeCloseTo(5050);
  });
  it("treats annual cadence as /12 and handles empty input", () => {
    expect(computeIdeaCost({ items: [{ category: "ONGOING_SUPPORT", name: "x", amount: 1200, isRecurring: true, cadence: "annual" }] }).ongoingAnnual).toBe(1200);
    expect(computeIdeaCost({ items: [] }).firstYearTotal).toBe(0);
  });
});

describe("ideaReadiness", () => {
  it("reports done items and the ready flag", () => {
    const cost = computeIdeaCost({ items: [], materialCostEstimate: 100 });
    const r = ideaReadiness({ problemStatement: "p", proposedSolution: "s", expectedBenefits: "b", feasibilityScore: 70, cost, researched: true, askDecisionNeeded: "approve", totalFundingRequired: 0 });
    expect(r.ready).toBe(true);
    expect(ideaReadiness({ cost, researched: false }).doneCount).toBe(1);
  });
});

describe("validateIdeaDecision", () => {
  it("requires a reason for PARK/STOP only", () => {
    expect(validateIdeaDecision("GO", "").ok).toBe(true);
    expect(validateIdeaDecision("STOP", " ").ok).toBe(false);
    expect(validateIdeaDecision("MAYBE", "x").ok).toBe(false);
  });
});

describe("research + chat sanitising", () => {
  it("normalises junk model output and drops unsafe/duplicate sources", () => {
    const r = normalizeResearch({ summary: 5, competitors: [{ name: "A", what: "x" }, null, { what: "no name" }], trends: "nope" }, [], false);
    expect(r.summary).toBe("");
    expect(r.competitors).toHaveLength(1);
    expect(r.trends).toEqual([]);
    const s = dedupeSources([{ title: "a", url: "https://x.com/a/" }, { title: "b", url: "https://x.com/a" }, { title: "c", url: "javascript:alert(1)" }]);
    expect(s).toHaveLength(1);
  });
  it("keeps only whitelisted, correctly typed chat changes", () => {
    const out = sanitizeChatChanges({ askTeam: " devs ", totalFundingRequired: "5000", evil: "x", budgetPlanned: -1, feasibilityNotes: 3 });
    expect(out).toEqual({ askTeam: "devs", totalFundingRequired: 5000 });
    expect(sanitizeChatChanges({ askTeam: "x", askTimeline: "y" }, ["askTeam"])).toEqual({ askTeam: "x" });
  });
});
