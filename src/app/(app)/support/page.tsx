import { notFound } from "next/navigation";
import { eq, isNull } from "drizzle-orm";
import Topbar from "@/components/Topbar";
import SupportTabs from "@/components/SupportTabs";
import ExportButtons from "@/components/ExportButtons";
import { db } from "@/lib/db";
import { incidents, projects, rateCards } from "@/lib/db/schema";
import { DEFAULT_ASSUMPTIONS } from "@/lib/supportEstimate";
import { mergeRateCardScopes } from "@/lib/deliveryModel";
import { getCurrentUser } from "@/lib/auth";
import { canAccessOptionalProject, filterProjectsForUser, isInternalStaff } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) notFound();

  // Rate cards are scoped per company now. ADMIN gets a true portfolio-wide average (every
  // company's rows); everyone else gets their own company's rates merged over the global
  // defaults — same "own company, falling back to defaults" rule used on a project's
  // Delivery & Pricing tab.
  const [incidentRowsRaw, projectRowsRaw, rateCardRows] = await Promise.all([
    db.select().from(incidents),
    db.select({ id: projects.id, name: projects.name, organizationId: projects.organizationId }).from(projects),
    user.role === "ADMIN"
      ? db.select().from(rateCards)
      : Promise.all([
          db.select().from(rateCards).where(isNull(rateCards.organizationId)),
          user.organizationId
            ? db.select().from(rateCards).where(eq(rateCards.organizationId, user.organizationId))
            : Promise.resolve([]),
        ]).then(([globalRows, orgRows]) => mergeRateCardScopes(globalRows, orgRows)),
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
