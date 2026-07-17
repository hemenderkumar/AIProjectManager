import { notFound } from "next/navigation";
import { eq, isNull } from "drizzle-orm";
import Topbar from "@/components/Topbar";
import { RagBadge, StageBadge, PriorityBadge } from "@/components/badges";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { resources as resourcesTable, rateCards as rateCardsTable } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canAccessProject, isInternalStaff } from "@/lib/tenancy";
import { mergeRateCardScopes } from "@/lib/deliveryModel";
import ProjectTabs from "@/components/project/ProjectTabs";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const allowed = await canAccessProject(user, id);
  if (!allowed) notFound();

  const detail = await getProjectDetail(id);
  if (!detail) notFound();

  // The Resources roster is internal-only (Task #68) — a client-company user (even a project
  // member) should never see the internal staffing sheet. Rate cards are different: they're
  // scoped per company now, so a client project shows that company's own rates (falling back
  // to the global defaults for anything they haven't configured) instead of nothing.
  const allResources = isInternalStaff(user) ? await db.select().from(resourcesTable) : [];
  const globalRateCards = await db.select().from(rateCardsTable).where(isNull(rateCardsTable.organizationId));
  const orgRateCards = detail.project.organizationId
    ? await db.select().from(rateCardsTable).where(eq(rateCardsTable.organizationId, detail.project.organizationId))
    : [];
  const rateCards = mergeRateCardScopes(globalRateCards, orgRateCards);

  return (
    <div>
      <Topbar
        title={detail.project.name}
        subtitle={detail.project.description ?? undefined}
        action={
          <div className="flex items-center gap-2">
            <StageBadge stage={detail.project.stage} />
            <PriorityBadge priority={detail.project.priority} />
            <RagBadge rag={detail.autoRag} />
          </div>
        }
      />
      <div className="p-8">
        <ProjectTabs detail={detail} allResources={allResources} user={user} rateCards={rateCards} />
      </div>
    </div>
  );
}
