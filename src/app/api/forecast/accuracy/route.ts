import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listVisibleProjects } from "@/lib/tenancy";
import { computeProjectEAC, computeForecastAccuracy, type EACTaskInput, type EACInvoiceInput, type EACSnapshotInput } from "@/lib/forecast";
import { db } from "@/lib/db";
import { tasks, resources, invoices, eacSnapshots } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

// Same visibility floor as /api/forecast/eac (VIEWER, no internal-only gate) -- this returns
// only aggregate accuracy numbers and per-project totals, no named resources.
export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const visible = await listVisibleProjects(user);
  const closed = visible.filter((p) => p.stage === "CLOSED");
  const closedIds = closed.map((p) => p.id);

  if (closedIds.length === 0) {
    return NextResponse.json(computeForecastAccuracy([], new Map(), new Map()));
  }

  let snapshotRows: (typeof eacSnapshots.$inferSelect)[] = [];
  try {
    snapshotRows = await db.select().from(eacSnapshots).where(inArray(eacSnapshots.projectId, closedIds));
  } catch {
    // Table may not exist yet in every environment -- treat as "no snapshots collected yet."
  }

  if (snapshotRows.length === 0) {
    return NextResponse.json(computeForecastAccuracy([], new Map(), new Map()));
  }

  const projectIdsWithSnapshots = [...new Set(snapshotRows.map((s) => s.projectId))];

  const [taskRows, resourceRows, invoiceRows] = await Promise.all([
    db.select().from(tasks).where(inArray(tasks.projectId, projectIdsWithSnapshots)),
    db.select().from(resources),
    db.select().from(invoices).where(inArray(invoices.projectId, projectIdsWithSnapshots)),
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
  const resourceInputs = resourceRows.map((r) => ({ id: r.id, costPerHour: r.costPerHour }));

  // "Final actual cost" per closed project, computed the exact same way EAC's own
  // actualCostToDate is (logged hours x rate + non-pending invoices) -- since the project is
  // closed, all its hours should already be logged, so this is our best estimate of what the
  // project really cost, independent of whether anyone kept budgetActual up to date.
  const closedById = new Map(closed.map((p) => [p.id, p]));
  const finalActualCostByProject = new Map<string, number>();
  for (const projectId of projectIdsWithSnapshots) {
    const project = closedById.get(projectId);
    if (!project) continue;
    const result = computeProjectEAC(
      { id: project.id, name: project.name, budgetPlanned: project.budgetPlanned, startDate: project.startDate, targetEndDate: project.targetEndDate },
      tasksByProject.get(projectId) ?? [],
      resourceInputs,
      invoicesByProject.get(projectId) ?? [],
      undefined,
      project.actualEndDate ? new Date(project.actualEndDate) : new Date()
    );
    finalActualCostByProject.set(projectId, result.actualCostToDate);
  }

  const snapshotsByProject = new Map<string, EACSnapshotInput[]>();
  for (const s of snapshotRows) {
    const arr = snapshotsByProject.get(s.projectId) ?? [];
    arr.push({ snapshotDate: s.snapshotDate, eac: s.eac, physicalPercentComplete: s.physicalPercentComplete });
    snapshotsByProject.set(s.projectId, arr);
  }

  const closedMeta = projectIdsWithSnapshots
    .map((id) => closedById.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p)
    .map((p) => ({ id: p.id, name: p.name }));

  const accuracy = computeForecastAccuracy(closedMeta, snapshotsByProject, finalActualCostByProject);
  return NextResponse.json(accuracy);
}
