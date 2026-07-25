import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { prProjects, prOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Logged-out, SEO-indexable postings list (#256). Only OPEN projects are ever public --
// DRAFT (not yet posted), NEGOTIATING/AWARDED/IN_PROGRESS/COMPLETED (already matched, no
// reason to advertise further), and CANCELLED are all excluded. This is the single query
// every public marketplace/postings/[id] page and the /marketplace landing list draws from.
export async function GET() {
  const rows = await db
    .select({
      id: prProjects.id,
      title: prProjects.title,
      description: prProjects.description,
      category: prProjects.category,
      targetBudget: prProjects.targetBudget,
      currency: prProjects.currency,
      engagementModel: prProjects.engagementModel,
      requestType: prProjects.requestType,
      skillsRequired: prProjects.skillsRequired,
      durationWeeks: prProjects.durationWeeks,
      rateType: prProjects.rateType,
      createdAt: prProjects.createdAt,
      clientOrgName: prOrganizations.name,
    })
    .from(prProjects)
    .innerJoin(prOrganizations, eq(prProjects.clientOrgId, prOrganizations.id))
    .where(eq(prProjects.status, "OPEN"));

  return NextResponse.json(rows);
}
