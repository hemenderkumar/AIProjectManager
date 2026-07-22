import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scProjects, scOrganizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Logged-out, SEO-indexable postings list (#256). Only OPEN projects are ever public --
// DRAFT (not yet posted), NEGOTIATING/AWARDED/IN_PROGRESS/COMPLETED (already matched, no
// reason to advertise further), and CANCELLED are all excluded. This is the single query
// every public marketplace/postings/[id] page and the /marketplace landing list draws from.
export async function GET() {
  const rows = await db
    .select({
      id: scProjects.id,
      title: scProjects.title,
      description: scProjects.description,
      category: scProjects.category,
      targetBudget: scProjects.targetBudget,
      currency: scProjects.currency,
      engagementModel: scProjects.engagementModel,
      requestType: scProjects.requestType,
      skillsRequired: scProjects.skillsRequired,
      durationWeeks: scProjects.durationWeeks,
      rateType: scProjects.rateType,
      createdAt: scProjects.createdAt,
      clientOrgName: scOrganizations.name,
    })
    .from(scProjects)
    .innerJoin(scOrganizations, eq(scProjects.clientOrgId, scOrganizations.id))
    .where(eq(scProjects.status, "OPEN"));

  return NextResponse.json(rows);
}
