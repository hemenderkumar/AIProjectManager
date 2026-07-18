import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliverables, deliverableTestCases } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

const TEST_TYPES = new Set(["FUNCTIONAL_TEST_SCRIPT", "UAT_SCRIPT"]);

// Cheap, no-AI aggregation of test execution results across every Functional Test Script /
// UAT Script deliverable in the project — fetched automatically when the Deliverables tab
// loads. The AI narrative (verdict + summary) is a separate, explicit action: POST
// /api/ai/release-readiness, triggered by a button rather than run on every page load.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await db.select().from(deliverables).where(eq(deliverables.projectId, id));
  const testDeliverables = rows.filter((d) => TEST_TYPES.has(d.type));
  const testDeliverableIds = testDeliverables.map((d) => d.id);
  const testCases = testDeliverableIds.length
    ? await db.select().from(deliverableTestCases).where(inArray(deliverableTestCases.deliverableId, testDeliverableIds))
    : [];

  const counts = { total: testCases.length, pass: 0, fail: 0, blocked: 0, notRun: 0 };
  for (const tc of testCases) {
    if (tc.status === "PASS") counts.pass += 1;
    else if (tc.status === "FAIL") counts.fail += 1;
    else if (tc.status === "BLOCKED") counts.blocked += 1;
    else counts.notRun += 1;
  }

  const breakdown = testDeliverables.map((d) => {
    const own = testCases.filter((tc) => tc.deliverableId === d.id);
    return {
      deliverableId: d.id,
      title: d.title,
      type: d.type,
      total: own.length,
      passed: own.filter((tc) => tc.status === "PASS").length,
      failed: own.filter((tc) => tc.status === "FAIL").length,
      blocked: own.filter((tc) => tc.status === "BLOCKED").length,
    };
  });

  return NextResponse.json({ counts, breakdown });
}
