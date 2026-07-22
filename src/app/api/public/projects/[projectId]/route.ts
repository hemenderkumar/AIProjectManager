import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scProjects, scOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Public posting detail (#256). Same OPEN-only rule as the list route -- a project that's
// moved on (negotiating, awarded, cancelled, etc.) 404s here even to someone who has the
// direct link, so a public link never keeps advertising a job that's no longer available.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [row] = await db
    .select({
      id: scProjects.id,
      title: scProjects.title,
      description: scProjects.description,
      category: scProjects.category,
      targetBudget: scProjects.targetBudget,
      currency: scProjects.currency,
      engagementModel: scProjects.engagementModel,
      locationRequirement: scProjects.locationRequirement,
      requestType: scProjects.requestType,
      skillsRequired: scProjects.skillsRequired,
      durationWeeks: scProjects.durationWeeks,
      rateType: scProjects.rateType,
      deadline: scProjects.deadline,
      createdAt: scProjects.createdAt,
      status: scProjects.status,
      clientOrgName: scOrganizations.name,
      clientOrgCountry: scOrganizations.primaryCountry,
    })
    .from(scProjects)
    .innerJoin(scOrganizations, eq(scProjects.clientOrgId, scOrganizations.id))
    .where(eq(scProjects.id, projectId));

  if (!row || row.status !== "OPEN") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
