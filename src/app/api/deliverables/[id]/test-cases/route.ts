import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deliverables, deliverableTestCases } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

// Adds one manual test case to an existing test-script deliverable (the AI-generated set
// comes from /api/ai/draft-deliverable, but the team can add more as they think of edge
// cases while executing).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [d] = await db.select().from(deliverables).where(eq(deliverables.id, id));
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await requireProjectAccess("CONTRIBUTOR", d.projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.scenario?.trim()) return NextResponse.json({ error: "scenario is required" }, { status: 400 });

  const existing = await db.select({ sequence: deliverableTestCases.sequence }).from(deliverableTestCases).where(eq(deliverableTestCases.deliverableId, id));
  const nextSequence = existing.length ? Math.max(...existing.map((r) => r.sequence)) + 1 : 0;

  const [created] = await db
    .insert(deliverableTestCases)
    .values({
      deliverableId: id,
      sequence: nextSequence,
      scenario: body.scenario.trim(),
      steps: body.steps || null,
      expectedResult: body.expectedResult || null,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
