import { notFound } from "next/navigation";
import Topbar from "@/components/Topbar";
import { RagBadge, StageBadge, PriorityBadge } from "@/components/badges";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { resources as resourcesTable, rateCards as rateCardsTable } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canAccessProject, isInternalStaff } from "@/lib/tenancy";
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

  // Resources roster and rate cards are internal-only (Task #68) — a client-company
  // user (even a project member) should never see the internal staffing/pricing sheet.
  const allResources = isInternalStaff(user) ? await db.select().from(resourcesTable) : [];
  const rateCards = isInternalStaff(user) ? await db.select().from(rateCardsTable) : [];

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
