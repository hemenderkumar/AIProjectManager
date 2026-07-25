import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prProjects, prOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Public posting detail (#256). Same OPEN-only rule as the list route -- a project that's
// moved on (negotiating, awarded, cancelled, etc.) 404s here even to someone who has the
// direct link, so a public link never keeps advertising a job that's no longer available.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [row] = await db
    .select({
      id: prProjects.id,
      title: prProjects.title,
      description: prProjects.description,
      category: prProjects.category,
      targetBudget: prProjects.targetBudget,
      currency: prProjects.currency,
      engagementModel: prProjects.engagementModel,
      locationRequirement: prProjects.locationRequirement,
      requestType: prProjects.requestType,
      skillsRequired: prProjects.skillsRequired,
      durationWeeks: prProjects.durationWeeks,
      rateType: prProjects.rateType,
      deadline: prProjects.deadline,
      createdAt: prProjects.createdAt,
      status: prProjects.status,
      clientOrgName: prOrganizations.name,
      clientOrgCountry: prOrganizations.primaryCountry,
    })
    .from(prProjects)
    .innerJoin(prOrganizations, eq(prProjects.clientOrgId, prOrganizations.id))
    .where(eq(prProjects.id, projectId));

  if (!row || row.status !== "OPEN") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}
