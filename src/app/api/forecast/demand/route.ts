import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listDemand } from "@/lib/demand";
import { computeDemandForecast } from "@/lib/forecast";
import { db } from "@/lib/db";
import { divisions } from "@/lib/db/schema";
import { or, eq, isNull } from "drizzle-orm";

// Mirrors /api/demand's own visibility rule (see lib/demand.ts's listDemand comment) so the
// forecast never shows a broader slice of the backlog than the plain list view already does:
// ADMIN sees every division; SUPER_USER sees their own org's divisions plus internal
// (organizationId null) ones; everyone else gets an empty forecast rather than a 403, same
// "front door stays visible, backlog data doesn't" stance as listDemand.
export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const demand = await listDemand(user);

  let divisionRows: { id: string; name: string }[] = [];
  if (user.role === "ADMIN") {
    divisionRows = await db.select({ id: divisions.id, name: divisions.name }).from(divisions);
  } else if (user.role === "SUPER_USER" && user.organizationId) {
    divisionRows = await db
      .select({ id: divisions.id, name: divisions.name })
      .from(divisions)
      .where(or(eq(divisions.organizationId, user.organizationId), isNull(divisions.organizationId)));
  }
  const divisionNameById = new Map(divisionRows.map((d) => [d.id, d.name]));

  const forecast = computeDemandForecast(demand, divisionNameById);
  return NextResponse.json(forecast);
}
