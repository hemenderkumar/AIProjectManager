import { NextResponse } from "next/server";
import { requireInternal, listVisibleProjects } from "@/lib/tenancy";
import { listDemand } from "@/lib/demand";
import { computeDemandForecast, computeCapacityVsDemandForecast, totalAllocationByResource } from "@/lib/forecast";
import { db } from "@/lib/db";
import { divisions, resources, projectResources } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

// Internal-only: this combines the demand pipeline (visible more broadly on /demand) with
// named resource allocation data (visible more broadly nowhere else outside Resources/Rate
// Cards), so it gets the stricter of the two gates -- same requireInternal rule as the skill
// capacity forecast and EAC's resource-level data.
export async function GET() {
  const user = await requireInternal("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [demand, divisionRows, resourceRows, visibleProjects] = await Promise.all([
    listDemand(user),
    db.select({ id: divisions.id, name: divisions.name }).from(divisions),
    db.select().from(resources),
    listVisibleProjects(user),
  ]);
  const divisionNameById = new Map(divisionRows.map((d) => [d.id, d.name]));

  const activeProjectIds = visibleProjects.filter((p) => p.stage !== "CLOSED").map((p) => p.id);
  const allocationRows =
    activeProjectIds.length > 0
      ? await db.select().from(projectResources).where(inArray(projectResources.projectId, activeProjectIds))
      : [];
  const allocationPercentByResource = totalAllocationByResource(
    allocationRows.map((a) => ({ resourceId: a.resourceId, allocationPercent: a.allocationPercent }))
  );

  const demandForecast = computeDemandForecast(demand, divisionNameById);
  const combined = computeCapacityVsDemandForecast(demandForecast, resourceRows, allocationPercentByResource);
  return NextResponse.json(combined);
}
