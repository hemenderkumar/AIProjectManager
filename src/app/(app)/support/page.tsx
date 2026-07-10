import Topbar from "@/components/Topbar";
import IncidentsBoard from "@/components/IncidentsBoard";
import { db } from "@/lib/db";
import { incidents, projects } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const [incidentRows, projectRows] = await Promise.all([
    db.select().from(incidents),
    db.select({ id: projects.id, name: projects.name }).from(projects),
  ]);

  const sorted = [...incidentRows].sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
  const serialized = sorted.map((i) => ({
    ...i,
    reportedAt: i.reportedAt.toISOString(),
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
  }));

  return (
    <div>
      <Topbar
        title="Ongoing Support"
        subtitle="Incident management and issue resolution across all projects"
      />
      <div className="p-8">
        <IncidentsBoard incidents={serialized} projects={projectRows} />
      </div>
    </div>
  );
}
