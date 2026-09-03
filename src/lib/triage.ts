import { askClaudeJSON } from "@/lib/ai";

export type TriageResult = {
  type: "IDEA" | "DEMAND" | "PROJECT";
  title: string;
  description: string;
  expectedOutcome: string | null;
  reasoning: string;
};

// Shared by both the authenticated wizard (/api/ai/triage) and the public, no-login teaser
// on the marketing homepage (/api/public/triage) -- same classification, same prompt, so a
// visitor's answer on the homepage matches exactly what they'd get once logged in. Kept as
// one function so the prompt only needs to be tuned in one place.
export async function triageIntake(text: string) {
  const system = `You are the intake triage for Executa, a project delivery platform with three
distinct front doors for new work:

- IDEA: a rough, unformed thought that hasn't been scoped or committed to yet -- something worth
  exploring before anyone commits budget or time (e.g. "we should probably look at automating
  invoicing sometime"). Becomes an Ideation-stage project record for brainstorming/feasibility.
- DEMAND: a specific ask or need that requires someone else's review, prioritization, or
  budget/capacity approval before work can start (e.g. "marketing wants a new landing page but
  we haven't scoped it or said yes yet"). Becomes a demand-backlog entry for triage.
- PROJECT: something specific and ready to move on -- scope, goal, or deliverable is clear enough
  to start planning immediately (e.g. "build a Chrome extension that auto-fills job applications,
  ship in 6 weeks"). Becomes a real project.

A person just typed the following, in their own words, with no idea which of the three buckets
Executa uses this maps to:
"""
${text}
"""

Classify it into exactly one of IDEA, DEMAND, or PROJECT using the definitions above, then draft
the fields needed to create it. Respond as JSON: { "type": "IDEA"|"DEMAND"|"PROJECT", "title":
short specific title (not vague), "description": 2-4 sentences expanding what they wrote into a
clear account -- do not invent specifics that aren't implied by the text, "expectedOutcome": one
sentence on what success looks like if this is DEMAND, otherwise null, "reasoning": one short
sentence explaining why this classification fits, written for the person who submitted it (e.g.
"This sounds like it needs budget sign-off before it can start, so it's a Demand.") }`;

  return askClaudeJSON<TriageResult>(system, "Triage this now.", 1200);
}
