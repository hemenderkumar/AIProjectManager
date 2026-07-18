import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { db } from "@/lib/db";
import { deliverables, deliverableTestCases } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

const TEST_TYPES = new Set(["FUNCTIONAL_TEST_SCRIPT", "UAT_SCRIPT"]);

type ReadinessResult = {
  verdict: "READY" | "AT_RISK" | "NOT_READY";
  summary: string;
  topBlockers: string[];
};

export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const user = await requireProjectAccess("VIEWER", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(deliverables).where(eq(deliverables.projectId, projectId));
  const testDeliverables = rows.filter((d) => TEST_TYPES.has(d.type));
  const testDeliverableIds = testDeliverables.map((d) => d.id);
  const testCases = testDeliverableIds.length
    ? await db.select().from(deliverableTestCases).where(inArray(deliverableTestCases.deliverableId, testDeliverableIds))
    : [];

  if (testCases.length === 0) {
    return NextResponse.json({
      error: "No test cases recorded yet — generate a Functional Test Script or UAT Script and run them first.",
    }, { status: 400 });
  }

  const counts = { total: testCases.length, pass: 0, fail: 0, blocked: 0, notRun: 0 };
  for (const tc of testCases) {
    if (tc.status === "PASS") counts.pass += 1;
    else if (tc.status === "FAIL") counts.fail += 1;
    else if (tc.status === "BLOCKED") counts.blocked += 1;
    else counts.notRun += 1;
  }

  const deliverableBreakdown = testDeliverables
    .map((d) => {
      const own = testCases.filter((tc) => tc.deliverableId === d.id);
      const flagged = own.filter((tc) => tc.status === "FAIL" || tc.status === "BLOCKED").map((tc) => `"${tc.scenario}" (${tc.status})`);
      return `- ${d.title} [${d.type}]: ${own.length} cases, ${own.filter((tc) => tc.status === "PASS").length} passed${
        flagged.length ? `, failing/blocked: ${flagged.join(", ")}` : ""
      }`;
    })
    .join("\n");

  const system = `You are a release manager producing a go/no-go readiness signal from test execution results,
so a PM doesn't have to read every individual test case row to know where things stand.

Test result totals: ${counts.total} total, ${counts.pass} passed, ${counts.fail} failed, ${counts.blocked} blocked, ${counts.notRun} not yet run.

Breakdown by test script:
${deliverableBreakdown}

Respond as JSON: { "verdict": "READY"|"AT_RISK"|"NOT_READY" (NOT_READY if any failed/blocked cases look like
they touch core functionality, or there's a large not-run backlog; AT_RISK for a handful of isolated
failures with most cases passing; READY only if nearly everything has run and passed), "summary": string
(2-3 sentences), "topBlockers": string[] (specific failing/blocked scenarios worth calling out by name, 0-5
items) }`;

  const { data, error } = await askClaudeJSON<ReadinessResult>(system, "Assess release readiness now.", 2000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  return NextResponse.json({ counts, ...data });
}
