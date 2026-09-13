import { db } from "./db";
import { users, statusUpdates, deliverables, apiKeys, webhooks } from "./db/schema";
import { eq, inArray, and, isNull, sql } from "drizzle-orm";
import { listVisibleProjects } from "./tenancy";
import { isModuleEnabled } from "./modules-server";
import type { SessionUser } from "./auth";

export type OnboardingItem = {
  key: string;
  label: string;
  description: string;
  href: string;
  ctaLabel: string;
  completed: boolean;
};

// A short, role-aware "getting started" checklist for /home -- deliberately built from real
// signals (has a project actually been created? has anyone logged a status update?) rather
// than a static list, so it reflects what THIS person/org has actually tried and naturally
// disappears item-by-item as they explore the app, instead of nagging forever. See the
// onboardingDismissedAt column on users for the manual-dismiss half of this (checked by the
// caller, not here, so this function stays a pure "what's true right now" read).
//
// Every item is scoped through listVisibleProjects(user) (same visibility rule as the
// dashboard/portal) so a PM/CONTRIBUTOR/VIEWER's checklist reflects their own projects, not
// the whole organization's.
export async function getOnboardingChecklist(user: SessionUser): Promise<OnboardingItem[]> {
  const visibleProjects = await listVisibleProjects(user);
  const projectIds = visibleProjects.map((p) => p.id);
  const hasProject = projectIds.length > 0;

  const [hasStatusUpdate, hasDeliverable] = await Promise.all([
    hasProject
      ? db.select({ id: statusUpdates.id }).from(statusUpdates).where(inArray(statusUpdates.projectId, projectIds)).limit(1)
      : Promise.resolve([]),
    hasProject
      ? db
          .select({ id: deliverables.id })
          .from(deliverables)
          .where(and(inArray(deliverables.projectId, projectIds), inArray(deliverables.status, ["IN_REVIEW", "APPROVED", "FINAL"])))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const items: OnboardingItem[] = [
    {
      key: "create_project",
      label: "Create your first project",
      description: "Kick off an idea, or skip straight to execution if the work is already scoped.",
      href: "/execution",
      ctaLabel: "New project",
      completed: hasProject,
    },
    {
      key: "log_status_update",
      label: "Log a status update",
      description: "Record RAG status, % complete, and what's next -- the backbone of every health rollup and report.",
      href: hasProject ? `/projects/${projectIds[0]}` : "/projects",
      ctaLabel: "Log an update",
      completed: hasStatusUpdate.length > 0,
    },
    {
      key: "publish_deliverable",
      label: "Publish a deliverable",
      description: "Move a requirements doc, design, or release doc to In Review so it's ready for sign-off.",
      href: hasProject ? `/projects/${projectIds[0]}` : "/projects",
      ctaLabel: "Open a project",
      completed: hasDeliverable.length > 0,
    },
  ];

  // Inviting teammates is a company-owner action (managed from My Organization, a
  // SUPER_USER-only page -- see Sidebar.tsx) -- showing it to a PM/CONTRIBUTOR/VIEWER who has
  // no way to act on it would just be a dead-end checklist item.
  if (user.role === "SUPER_USER" && user.organizationId) {
    const [{ count: teamCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), isNull(users.disabledAt)));

    items.push({
      key: "invite_team",
      label: "Invite your team",
      description: "Add teammates from My Organization so they can see and update their own projects.",
      href: "/organization",
      ctaLabel: "Invite teammates",
      completed: Number(teamCount) > 1,
    });
  }

  // Integrations are an organization-wide setting, gated the same way the nav item is (plan
  // tier via isModuleEnabled, company-owner/admin role) -- internal Executa staff always pass
  // the module check (see isModuleEnabled's null-organizationId short-circuit) and have their
  // own org-less API keys/webhooks (organizationId is nullable on both tables for exactly
  // this case).
  if ((user.role === "SUPER_USER" || user.role === "ADMIN") && (await isModuleEnabled(user, "integrations"))) {
    const orgFilter = user.organizationId ? eq(apiKeys.organizationId, user.organizationId) : isNull(apiKeys.organizationId);
    const webhookOrgFilter = user.organizationId ? eq(webhooks.organizationId, user.organizationId) : isNull(webhooks.organizationId);

    const [existingKeys, existingWebhooks] = await Promise.all([
      db.select({ id: apiKeys.id }).from(apiKeys).where(and(orgFilter, isNull(apiKeys.revokedAt))).limit(1),
      db.select({ id: webhooks.id }).from(webhooks).where(and(webhookOrgFilter, eq(webhooks.isActive, true))).limit(1),
    ]);

    items.push({
      key: "connect_integration",
      label: "Connect an integration",
      description: "Create an API key or webhook so Executa can notify (or be notified by) the tools your team already uses.",
      href: "/settings/integrations",
      ctaLabel: "Set up integration",
      completed: existingKeys.length > 0 || existingWebhooks.length > 0,
    });
  }

  return items;
}

// onboardingDismissedAt lives only in the DB (not the JWT session), same reasoning as
// users.theme -- it can change between requests without forcing a re-login, so it's read
// fresh here rather than embedded in SessionUser.
export async function isOnboardingDismissed(userId: string): Promise<boolean> {
  const [row] = await db.select({ onboardingDismissedAt: users.onboardingDismissedAt }).from(users).where(eq(users.id, userId));
  return row?.onboardingDismissedAt != null;
}
