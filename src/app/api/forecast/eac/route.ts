import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listVisibleProjects } from "@/lib/tenancy";
import { computePortfolioEAC, type EACTaskInput, type EACInvoiceInput } from "@/lib/forecast";
import { db } from "@/lib/db";
import { tasks, resources, invoices, eacSnapshots } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

// Same visibility floor as the Execution page's own project list (VIEWER — no internal-only
// gate) since that page already shows every visible project's budgetActual/budgetPlanned to
// anyone who can see the project at all; this forecast is just a more careful version of the
// same numbers, not a new disclosure.
const FORECASTABLE_STAGES = ["EXECUTION", "CLOSING"];

export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const visible = await listVisibleProjects(user);
  const active = visible.filter((p) => FORECASTABLE_STAGES.includes(p.stage));
  const activeIds = active.map((p) => p.id);

  if (activeIds.length === 0) {
    return NextResponse.json(computePortfolioEAC([], new Map(), [], new Map()));
  }

  const [taskRows, resourceRows, invoiceRows] = await Promise.all([
    db.select().from(tasks).where(inArray(tasks.projectId, activeIds)),
    db.select().from(resources),
    db.select().from(invoices).where(inArray(invoices.projectId, activeIds)),
  ]);

  const tasksByProject = new Map<string, EACTaskInput[]>();
  for (const t of taskRows) {
    const arr = tasksByProject.get(t.projectId) ?? [];
    arr.push({ id: t.id, assigneeId: t.assigneeId, estimateHours: t.estimateHours, actualHours: t.actualHours });
    tasksByProject.set(t.projectId, arr);
  }

  const invoicesByProject = new Map<string, EACInvoiceInput[]>();
  for (const inv of invoiceRows) {
    const arr = invoicesByProject.get(inv.projectId) ?? [];
    arr.push({ amount: inv.amount, status: inv.status });
    invoicesByProject.set(inv.projectId, arr);
  }

  const projectInputs = active.map((p) => ({
    id: p.id,
    name: p.name,
    budgetPlanned: p.budgetPlanned,
    startDate: p.startDate,
    targetEndDate: p.targetEndDate,
  }));

  const forecast = computePortfolioEAC(
    projectInputs,
    tasksByProject,
    resourceRows.map((r) => ({ id: r.id, costPerHour: r.costPerHour })),
    invoicesByProject
  );

  // Opportunistic snapshot capture for the forecast accuracy tracker (see lib/forecast.ts's
  // computeForecastAccuracy) -- no cron involved, this just upserts today's row for every
  // project computed above whenever anyone loads the Execution page. Best-effort: a failure
  // here (e.g. the eac_snapshots table not migrated onto this environment yet) shouldn't ever
  // break the forecast itself, so it's swallowed rather than propagated.
  try {
    const today = new Date().toISOString().slice(0, 10);
    await Promise.all(
      forecast.projects.map((p) =>
        db
          .insert(eacSnapshots)
          .values({
            projectId: p.projectId,
            snapshotDate: today,
            eac: p.eac,
            actualCostToDate: p.actualCostToDate,
            physicalPercentComplete: p.physicalPercentComplete,
            budgetPlanned: p.budgetPlanned,
          })
          .onConflictDoUpdate({
            target: [eacSnapshots.projectId, eacSnapshots.snapshotDate],
            set: {
              eac: p.eac,
              actualCostToDate: p.actualCostToDate,
              physicalPercentComplete: p.physicalPercentComplete,
              budgetPlanned: p.budgetPlanned,
            },
          })
      )
    );
  } catch {
    // Table may not exist yet in every environment (see add-eac-snapshots-migration.sql) --
    // the accuracy tracker just won't have data to show until it's migrated, same as any other
    // forecast panel with nothing to display yet.
  }

  return NextResponse.json(forecast);
}
