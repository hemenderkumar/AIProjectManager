import { notFound } from "next/navigation";
import Topbar from "@/components/Topbar";
import SupportTabs from "@/components/SupportTabs";
import ExportButtons from "@/components/ExportButtons";
import { db } from "@/lib/db";
import { incidents, projects, rateCards } from "@/lib/db/schema";
import { DEFAULT_ASSUMPTIONS } from "@/lib/supportEstimate";
import { getCurrentUser } from "@/lib/auth";
import { canAccessOptionalProject, filterProjectsForUser, isInternalStaff } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  const [incidentRowsRaw, projectRowsRaw, rateCardRows] = await Promise.all([
    db.select().from(incidents),
    db.select({ id: projects.id, name: projects.name, organizationId: projects.organizationId }).from(projects),
    db.select().from(rateCards),
  ]);

  // Ongoing Support is portfolio-wide by design, but that must never mean cross-tenant —
  // an incident (and the project picker used to file one) is scoped exactly like everywhere
  // else: linked-project access rule for incidents, membership/org for the project list.
  const incidentRows = (
    await Promise.all(incidentRowsRaw.map(async (i) => ((await canAccessOptionalProject(user, i.projectId)) ? i : null)))
  ).filter((i): i is (typeof incidentRowsRaw)[number] => i !== null);
  const projectRows = await filterProjectsForUser(projectRowsRaw, user);

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
        action={<ExportButtons endpoint="/api/reports/support" filenamePrefix="support-incidents" />}
      />
      <div className="p-8">
        <SupportTabs
          incidents={serialized}
          projects={projectRows}
          defaultBlendedHourlyRate={defaultBlendedHourlyRate}
          showPatterns={isInternalStaff(user)}
        />
      </div>
    </div>
  );
}
