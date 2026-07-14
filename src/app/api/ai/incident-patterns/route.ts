import { NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { incidents, projects } from "@/lib/db/schema";
import { requireInternal } from "@/lib/tenancy";

type IncidentPattern = {
  name: string;
  count: number;
  incidentTitles: string[];
  projects: string[];
  summary: string;
  ideaType: "PROBLEM";
  problemStatement: string;
  proposedSolution: string;
  expectedBenefits: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

type IncidentPatternsResult = { patterns: IncidentPattern[] };

// Ongoing Support logs incidents one at a time as they happen, so recurring operational
// problems are easy to miss -- nobody's job is to scroll back through weeks of tickets
// looking for a repeated root cause. This groups incidents by AI-judged similarity (not
// exact title matches, since "API timeout at checkout" and "Payment gateway slow" can be
// the same underlying issue worded differently) and, for each recurring pattern, proposes a
// ready-to-file improvement idea so a PM can convert it straight into Ideation.
//
// Internal-only: incidents don't carry an organizationId of their own (see schema.ts), and
// Ongoing Support is portfolio-wide by design -- pulling every incident into one prompt for
// pattern-finding would leak cross-client data to a client-company user. Same restriction as
// /api/ai/suggest-ideas.
export async function POST() {
  const user = await requireInternal("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [incidentRows, projectRows] = await Promise.all([
    db.select().from(incidents),
    db.select({ id: projects.id, name: projects.name }).from(projects),
  ]);

  // Not enough history to responsibly claim a "pattern" -- say so plainly rather than
  // asking the model to invent recurrence out of two or three isolated tickets.
  if (incidentRows.length < 3) {
    return NextResponse.json<IncidentPatternsResult>({ patterns: [] });
  }

  const projectNameById = new Map(projectRows.map((p) => [p.id, p.name]));
  const incidentList = incidentRows
    .map((i) => {
      const projectName = i.projectId ? projectNameById.get(i.projectId) ?? "Unknown project" : "Unassigned / shared";
      return `- "${i.title}" (severity: ${i.severity}, status: ${i.status}, project: ${projectName})${
        i.description ? ` — ${i.description.slice(0, 200)}` : ""
      }`;
    })
    .join("\n");

  const system = `You are a PMO analyst reviewing every incident logged in Ongoing Support to find RECURRING
OPERATIONAL PATTERNS -- clusters of 2 or more incidents that share the same underlying root cause or theme,
even if worded differently (e.g. "API timeout at checkout" and "Payment gateway slow" can be the same
pattern). Group by meaning, not exact text matches. Do NOT report a "pattern" for a single isolated
incident -- only report groups of 2 or more. If nothing genuinely recurs, return an empty patterns array
rather than forcing weak groupings.

All logged incidents:
${incidentList}

For each real recurring pattern found, respond as JSON: { "patterns": IncidentPattern[] } where each is:
{ "name": short pattern name, "count": number of incidents in this group, "incidentTitles": string[] (the
exact titles from the list above that belong to this group), "projects": string[] (distinct project names
involved), "summary": 1-2 sentences on the likely root cause, "ideaType": "PROBLEM",
"problemStatement": 1-2 sentences framing this as a project problem statement, "proposedSolution": 1-2
sentences on the systematic fix (not another workaround), "expectedBenefits": 1-2 sentences,
"priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" based on frequency and severity }`;

  const { data, error } = await askClaudeJSON<IncidentPatternsResult>(
    system,
    "Find recurring incident patterns now.",
    3000
  );

  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
