import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { requireRole } from "@/lib/auth";

type TriageResult = {
  type: "IDEA" | "DEMAND" | "PROJECT";
  title: string;
  description: string;
  expectedOutcome: string | null;
  reasoning: string;
};

// Backs the "What's on your mind?" wizard on /home -- the single free-text entry point that
// stands in for having to already know Executa's own vocabulary (is this a Demand, an Idea,
// or a Project?) before you've even used the product. The user just describes the thing in
// their own words; this classifies it into whichever of the three it actually is and drafts
// the fields that entity needs, so the wizard can create it with one confirm click. The user
// still sees and can override the classification before anything is created -- same
// propose-then-confirm pattern as the rest of the app's AI-drafting flows (AiEditChat,
// draft-incident, etc.), just for "what kind of thing is this" instead of "what changed."
export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Describe what's on your mind first." }, { status: 400 });
  }

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

  const { data, error } = await askClaudeJSON<TriageResult>(system, "Triage this now.", 1200);

  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
