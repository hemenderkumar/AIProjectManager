import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const _authUser = await requireRole("VIEWER");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await getAllProjectsWithMetrics();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(projects)
    .values({
      name: body.name,
      description: body.description ?? null,
      sponsor: body.sponsor ?? null,
      projectManager: body.projectManager ?? null,
      stage: body.stage ?? "INCEPTION",
      priority: body.priority ?? "MEDIUM",
      country: body.country ?? null,
      program: body.program ?? null,
      problemStatement: body.problemStatement ?? null,
      proposedSolution: body.proposedSolution ?? null,
      expectedBenefits: body.expectedBenefits ?? null,
      ideationNotes: body.ideationNotes ?? null,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
