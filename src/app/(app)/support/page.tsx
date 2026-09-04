import { notFound } from "next/navigation";
import { eq, isNull } from "drizzle-orm";
import Topbar from "@/components/Topbar";
import SupportTabs from "@/components/SupportTabs";
import ExportButtons from "@/components/ExportButtons";
import { db } from "@/lib/db";
import { projects, rateCards, users } from "@/lib/db/schema";
import { listIncidents } from "@/lib/incidents";
import { DEFAULT_ASSUMPTIONS } from "@/lib/supportEstimate";
import { mergeRateCardScopes } from "@/lib/deliveryModel";
import { getCurrentUser } from "@/lib/auth";
import { filterProjectsForUser, isInternalStaff } from "@/lib/tenancy";
import { isModuleEnabled } from "@/lib/modules-server";
import { MODULE_REGISTRY } from "@/lib/modules";
import ModuleLocked from "@/components/ModuleLocked";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await isModuleEnabled(user, "support"))) {
    return <ModuleLocked moduleName={MODULE_REGISTRY.support.label} />;
  }

  // Rate cards are scoped per company now. ADMIN gets a true portfolio-wide average (every
  // company's rows); everyone else gets their own company's rates merged over the global
  // defaults — same "own company, falling back to defaults" rule used on a project's
  // Delivery & Pricing tab.
  const [incidentRows, projectRowsRaw, rateCardRows, userRows] = await Promise.all([
    // Ongoing Support is portfolio-wide by design, but that must never mean cross-tenant --
    // listIncidents applies the same linked-project-access-rule / internal-only-if-unlinked
    // visibility as a SQL WHERE, rather than fetching every org's incidents and filtering
    // them one row at a time in JS (the old approach here, and the same class of perf/scale
    // bug already fixed for projects/tasks -- see lib/incidents.ts for the fix).
    listIncidents(user),
    db.select({ id: projects.id, name: projects.name, organizationId: projects.organizationId }).from(projects),
    user.role === "ADMIN"
      ? db.select().from(rateCards)
      : Promise.all([
          db.select().from(rateCards).where(isNull(rateCards.organizationId)),
          user.organizationId
            ? db.select().from(rateCards).where(eq(rateCards.organizationId, user.organizationId))
            : Promise.resolve([]),
        ]).then(([globalRows, orgRows]) => mergeRateCardScopes(globalRows, orgRows)),
    // Directory for the assignee/reported-by pickers -- same org-scoping as everything else
    // here (ADMIN: everyone; internal staff: internal users; client user: their own org).
    user.role === "ADMIN"
      ? db.select({ id: users.id, name: users.name }).from(users)
      : db.select({ id: users.id, name: users.name }).from(users).where(user.organizationId ? eq(users.organizationId, user.organizationId) : isNull(users.organizationId)),
  ]);

  const projectRows = await filterProjectsForUser(projectRowsRaw, user);

  const sorted = [...incidentRows].sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());
  const serialized = sorted.map((i) => ({
    ...i,
    reportedAt: i.reportedAt.toISOString(),
    acknowledgedAt: i.acknowledgedAt ? i.acknowledgedAt.toISOString() : null,
    resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
    escalatedAt: i.escalatedAt ? i.escalatedAt.toISOString() : null,
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
          users={userRows}
          defaultBlendedHourlyRate={defaultBlendedHourlyRate}
          showPatterns={isInternalStaff(user)}
        />
      </div>
    </div>
  );
}
