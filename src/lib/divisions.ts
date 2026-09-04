import { db } from "./db";
import { divisions, stakeholders } from "./db/schema";
import { inArray } from "drizzle-orm";

type DivisionAnnotatable = {
  organizationId: string | null;
  sponsorStakeholderId: string | null;
};

// Shared by /projects, /ideation (and anywhere else that lists projects) to resolve each
// project's division for filtering/display. There's no direct projects.divisionId column --
// division is reached via projects.sponsorStakeholderId -> stakeholders.divisionId (see the
// "structured project sponsor" schema comment) -- so this does the two lookups once and
// annotates every item, rather than each page reimplementing the same join-by-hand.
//
// Only queries divisions/stakeholders for the organizationIds actually present in `items`,
// which are already tenancy-filtered by the caller (getAllProjectsWithMetrics) -- this never
// broadens what the user can see, it only resolves labels for rows they're already allowed to
// see. divisionOptions covers every division that exists for those orgs (not just ones
// currently in use), so the filter dropdown can show a division with zero items in it too.
export async function attachDivisionInfo<T extends DivisionAnnotatable>(
  items: T[]
): Promise<{
  items: (T & { divisionId: string | null; divisionName: string | null })[];
  divisionOptions: { id: string; name: string }[];
}> {
  const orgIds = Array.from(new Set(items.map((i) => i.organizationId).filter((id): id is string => !!id)));

  if (orgIds.length === 0) {
    return { items: items.map((i) => ({ ...i, divisionId: null, divisionName: null })), divisionOptions: [] };
  }

  const [divisionRows, stakeholderRows] = await Promise.all([
    db.select({ id: divisions.id, name: divisions.name }).from(divisions).where(inArray(divisions.organizationId, orgIds)),
    db.select({ id: stakeholders.id, divisionId: stakeholders.divisionId }).from(stakeholders).where(inArray(stakeholders.organizationId, orgIds)),
  ]);

  const divisionNameById = new Map(divisionRows.map((d) => [d.id, d.name]));
  const stakeholderDivisionById = new Map(stakeholderRows.map((s) => [s.id, s.divisionId]));

  const annotated = items.map((item) => {
    const divisionId = item.sponsorStakeholderId ? stakeholderDivisionById.get(item.sponsorStakeholderId) ?? null : null;
    const divisionName = divisionId ? divisionNameById.get(divisionId) ?? null : null;
    return { ...item, divisionId, divisionName };
  });

  const divisionOptions = divisionRows
    .map((d) => ({ id: d.id, name: d.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { items: annotated, divisionOptions };
}
