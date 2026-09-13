import { db } from "./db";
import { budgetBaselines, costItems } from "./db/schema";
import { eq, and } from "drizzle-orm";

export async function getActiveBaseline(projectId: string) {
  const [row] = await db
    .select()
    .from(budgetBaselines)
    .where(and(eq(budgetBaselines.projectId, projectId), eq(budgetBaselines.isActive, true)));
  return row ?? null;
}

// Renders the project's current itemized cost_items into a plain-text snapshot for
// breakdownSnapshot -- a point-in-time record independent of the live rows, which may be
// edited or deleted after this baseline is locked (see the comment on budgetBaselines in
// schema.ts). Grouped by category since that's how the Charter's own Cost Summary already
// presents them, so the snapshot reads the same way a PM already expects.
export async function renderCostBreakdownSnapshot(projectId: string): Promise<string | null> {
  const items = await db.select().from(costItems).where(eq(costItems.projectId, projectId));
  if (items.length === 0) return null;
  const byCategory = new Map<string, number>();
  for (const item of items) {
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.amount);
  }
  return [...byCategory.entries()]
    .map(([category, total]) => `${category}: $${total.toLocaleString()}`)
    .join("\n");
}

// Locks a new baseline version for `projectId`, deactivating whichever baseline is currently
// active (if any) in the same call. Every baseline change in the app funnels through this one
// function -- manual re-baselining (POST /budget-baselines) and change-request approval both
// call it -- so "exactly one active baseline per project, versions always increment, nothing is
// ever mutated in place" stays true no matter which UI action triggered it. See the comment on
// budgetBaselines in schema.ts for why baselines are append-only rather than editable.
export async function lockNewBaseline(params: {
  projectId: string;
  totalAmount: number;
  breakdownSnapshot?: string | null;
  notes?: string | null;
  lockedBy: string;
}) {
  const current = await getActiveBaseline(params.projectId);
  const nextVersion = (current?.versionNumber ?? 0) + 1;

  if (current) {
    await db
      .update(budgetBaselines)
      .set({ isActive: false, supersededAt: new Date() })
      .where(eq(budgetBaselines.id, current.id));
  }

  const [created] = await db
    .insert(budgetBaselines)
    .values({
      projectId: params.projectId,
      versionNumber: nextVersion,
      totalAmount: params.totalAmount,
      breakdownSnapshot: params.breakdownSnapshot ?? null,
      notes: params.notes ?? null,
      isActive: true,
      lockedBy: params.lockedBy,
    })
    .returning();

  return created;
}
