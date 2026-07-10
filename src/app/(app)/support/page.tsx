import Topbar from "@/components/Topbar";
import SupportTabs from "@/components/SupportTabs";
import { db } from "@/lib/db";
import { incidents, projects, rateCards } from "@/lib/db/schema";
import { DEFAULT_ASSUMPTIONS } from "@/lib/supportEstimate";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const [incidentRows, projectRows, rateCardRows] = await Promise.all([
    db.select().from(incidents),
    db.select({ id: projects.id, name: projects.name }).from(projects),
    db.select().from(rateCards),
  ]);

  const sorted = [...incidentRows].sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
  const serialized = sorted.map((i) => ({
    ...i,
    reportedAt: i.reportedAt.toISOString(),
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
  }));

  // Default blended rate for the estimator now comes from the org's Rate Card (avg $/hr
  // across all roles/sourcing types) instead of a hardcoded number — still fully editable
  // per-session in the Assumptions panel.
  const defaultBlendedHourlyRate =
    rateCardRows.length > 0
      ? Math.round(rateCardRows.reduce((s, r) => s + r.hourlyRate, 0) / rateCardRows.length)
      : DEFAULT_ASSUMPTIONS.blendedHourlyRate;

  return (
    <div>
      <Topbar
        title="Ongoing Support"
        subtitle="Incident management and issue resolution across all projects"
      />
      <div className="p-8">
        <SupportTabs incidents={serialized} projects={projectRows} defaultBlendedHourlyRate={defaultBlendedHourlyRate} />
      </div>
    </div>
  );
}
