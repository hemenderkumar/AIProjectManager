import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { sows, projects, deliverables, deliverableTestCases } from "./db/schema";

const TEST_TYPES = new Set(["FUNCTIONAL_TEST_SCRIPT", "UAT_SCRIPT"]);

export type VendorScorecard = {
  vendorName: string;
  sowCount: number;
  totalFunding: number;
  statusBreakdown: Record<string, number>;
  testCasesTotal: number;
  testCasesPassed: number;
  testPassRate: number | null; // null = no test cases recorded against this vendor's projects yet
  projects: string[];
};

// Aggregates every SOW signed by companyId's projects, grouped by vendor name (trimmed,
// case-insensitive — free-text vendor names won't always match casing exactly). Test pass
// rate is attributed at the PROJECT level (a project's overall test results), not per-SOW,
// since a deliverable's test cases aren't linked to a specific vendor/SOW in the schema — an
// approximation that's accurate for the common case of one vendor per project, and a known
// simplification worth revisiting if multi-vendor projects become common.
export async function getVendorScorecards(organizationId: string): Promise<VendorScorecard[]> {
  const rows = await db
    .select({
      vendorName: sows.vendorName,
      status: sows.status,
      fundingAmount: sows.fundingAmount,
      projectId: sows.projectId,
      projectName: projects.name,
    })
    .from(sows)
    .innerJoin(projects, eq(sows.projectId, projects.id))
    .where(eq(projects.organizationId, organizationId));

  if (rows.length === 0) return [];

  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const deliverableRows = await db
    .select({ id: deliverables.id, projectId: deliverables.projectId, type: deliverables.type })
    .from(deliverables)
    .where(inArray(deliverables.projectId, projectIds));

  const testDeliverableIds = deliverableRows.filter((d) => TEST_TYPES.has(d.type)).map((d) => d.id);
  const testCaseRows = testDeliverableIds.length
    ? await db
        .select({ deliverableId: deliverableTestCases.deliverableId, status: deliverableTestCases.status })
        .from(deliverableTestCases)
        .where(inArray(deliverableTestCases.deliverableId, testDeliverableIds))
    : [];

  const deliverableToProject = new Map(deliverableRows.map((d) => [d.id, d.projectId]));
  const projectTestStats = new Map<string, { total: number; passed: number }>();
  for (const tc of testCaseRows) {
    const pid = deliverableToProject.get(tc.deliverableId);
    if (!pid) continue;
    const cur = projectTestStats.get(pid) ?? { total: 0, passed: 0 };
    cur.total += 1;
    if (tc.status === "PASS") cur.passed += 1;
    projectTestStats.set(pid, cur);
  }

  const byVendor = new Map<string, VendorScorecard>();
  for (const r of rows) {
    const key = r.vendorName.trim().toLowerCase();
    let v = byVendor.get(key);
    if (!v) {
      v = {
        vendorName: r.vendorName.trim(),
        sowCount: 0,
        totalFunding: 0,
        statusBreakdown: {},
        testCasesTotal: 0,
        testCasesPassed: 0,
        testPassRate: null,
        projects: [],
      };
      byVendor.set(key, v);
    }
    v.sowCount += 1;
    v.totalFunding += r.fundingAmount ?? 0;
    v.statusBreakdown[r.status] = (v.statusBreakdown[r.status] ?? 0) + 1;
    if (!v.projects.includes(r.projectName)) v.projects.push(r.projectName);

    const stats = projectTestStats.get(r.projectId);
    if (stats) {
      v.testCasesTotal += stats.total;
      v.testCasesPassed += stats.passed;
    }
  }

  for (const v of byVendor.values()) {
    v.testPassRate = v.testCasesTotal > 0 ? Math.round((v.testCasesPassed / v.testCasesTotal) * 100) : null;
  }

  return [...byVendor.values()].sort((a, b) => b.sowCount - a.sowCount);
}
