import { notFound } from "next/navigation";
import Topbar from "@/components/Topbar";
import { RagBadge, StageBadge, PriorityBadge } from "@/components/badges";
import { getProjectDetail } from "@/lib/portfolio";
import { db } from "@/lib/db";
import { resources as resourcesTable, rateCards as rateCardsTable } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth";
import ProjectTabs from "@/components/project/ProjectTabs";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getProjectDetail(id);
  if (!detail) notFound();

  const allResources = await db.select().from(resourcesTable);
  const rateCards = await db.select().from(rateCardsTable);
  const user = await getCurrentUser();

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
