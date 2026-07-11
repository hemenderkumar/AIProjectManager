import { NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getPortfolioSummary, formatPortfolioForAI } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { incidents } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";
import { isInternalStaff } from "@/lib/tenancy";

type IdeaSuggestion = {
  name: string;
  ideaType: "OPPORTUNITY" | "PROBLEM";
  problemStatement: string;
  proposedSolution: string;
  expectedBenefits: string;
  rationale: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

type SuggestIdeasResult = { ideas: IdeaSuggestion[] };

// Proactively generates new project/improvement ideas from the user's own visible portfolio
// (existing projects + recurring support incidents) so ideation doesn't rely entirely on
// someone typing every idea in by hand. Scoped to what the caller can see — a client-company
// user only gets ideas informed by their own projects, never another client's.
export async function POST() {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const summary = await getPortfolioSummary(user);
  const portfolioContext = formatPortfolioForAI(summary);

  // Incidents don't carry an organizationId of their own (only an optional projectId), and
  // Ongoing Support is portfolio-wide by design (see /api/incidents) — so pulling incident
  // titles into this prompt is internal-only context, never shown to a client-company user.
  let recentIncidentTitles = "(not included for this user)";
  if (isInternalStaff(user)) {
    const allIncidents = await db.select().from(incidents);
    recentIncidentTitles =
      allIncidents
        .slice(0, 20)
        .map((i) => `- ${i.title} (${i.severity})`)
        .join("\n") || "(none recorded)";
  }

  const system = `You are a PMO strategist helping generate NEW project or improvement ideas for a
portfolio you can already see below. Do not repeat or lightly reword any project that already exists in
the portfolio — propose genuinely new ideas. Ground suggestions in what's actually shown (recurring
themes in low-health projects, patterns in the incident titles, obvious gaps) rather than generic
industry buzz; if the portfolio is sparse, it's fine to propose sensible general PMO improvement ideas,
but say so plainly rather than inventing specifics that aren't supported by the data.

${portfolioContext}

Recent support incidents (titles only):
${recentIncidentTitles}

Respond as JSON: { "ideas": IdeaSuggestion[] } with exactly 4 ideas, each:
{ "name": short project name, "ideaType": "OPPORTUNITY" | "PROBLEM" (PROBLEM if it fixes a pain point/
recurring incident, OPPORTUNITY if it's a new capability/improvement), "problemStatement": 1-2 sentences,
"proposedSolution": 1-2 sentences, "expectedBenefits": 1-2 sentences, "rationale": 1 sentence on why THIS
idea, referencing the specific portfolio signal that prompted it, "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" }`;

  const { data, error } = await askClaudeJSON<SuggestIdeasResult>(
    system,
    "Generate 4 new idea suggestions now.",
    2000
  );

  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
