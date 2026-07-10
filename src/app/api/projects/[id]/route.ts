import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getProjectDetail } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("VIEWER");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const data = await getProjectDetail(id);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const allowed = [
    "name", "description", "sponsor", "projectManager", "stage", "priority",
    "country", "program",
    "ragStatus", "startDate", "targetEndDate", "actualEndDate", "budgetPlanned",
    "budgetActual", "percentComplete", "problemStatement", "proposedSolution",
    "expectedBenefits", "ideationNotes", "ideationAlignment", "businessCase", "objectives",
    "scopeInScope", "scopeOutOfScope", "deliverables", "successCriteria",
    "stakeholders", "assumptionsRisks", "risks", "totalFundingRequired",
    "integratedSystems", "highLevelArchitecture", "roiExpected",
    "charterApprovedBy", "charterApprovedAt",
    "feasibilityScore", "feasibilityNotes", "stageApprovedBy", "stageApprovedAt",
  ];

  const dateFields = ["startDate", "targetEndDate", "actualEndDate", "charterApprovedAt", "stageApprovedAt"];
  const numericFields = ["budgetPlanned", "budgetActual", "percentComplete", "totalFundingRequired", "feasibilityScore"];

  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in body) {
      const v = body[key];
      if (dateFields.includes(key)) {
        // An empty string (date input cleared, or never set) must become null, not "" —
        // Postgres rejects "" for a timestamp column and would fail the whole update.
        update[key] = v ? new Date(v) : null;
      } else if (numericFields.includes(key)) {
        // Same class of bug as dates: an empty/blank number input must become null,
        // not "" or NaN, or the whole update fails against a numeric column.
        update[key] = v === "" || v === null || Number.isNaN(Number(v)) ? null : Number(v);
      } else {
        update[key] = v;
      }
    }
  }

  const [updated] = await db
    .update(projects)
    .set(update)
    .where(eq(projects.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await db.delete(projects).where(eq(projects.id, id));
  return NextResponse.json({ ok: true });
}
