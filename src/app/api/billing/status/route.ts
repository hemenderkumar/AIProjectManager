import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { organizations, plans } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { isOrgBillingBlocked, listActivePlans, checkPlanLimit } from "@/lib/billing";

// Powers the /billing page: current org's trial/subscription state plus the catalog of
// plans someone could subscribe to. Internal staff (organizationId null) get a minimal
// response since billing doesn't apply to them.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.organizationId) {
    return NextResponse.json({ internal: true, blocked: false, org: null, plans: await listActivePlans() });
  }

  const [org] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      trialEndsAt: organizations.trialEndsAt,
      subscriptionStatus: organizations.subscriptionStatus,
      billingCompedByAdmin: organizations.billingCompedByAdmin,
      planId: organizations.planId,
    })
    .from(organizations)
    .where(eq(organizations.id, user.organizationId));

  const [plan] = org?.planId ? await db.select().from(plans).where(eq(plans.id, org.planId)) : [null];

  const [seats, projectsUsage] = await Promise.all([
    checkPlanLimit(user.organizationId, "seat"),
    checkPlanLimit(user.organizationId, "project"),
  ]);

  return NextResponse.json({
    internal: false,
    blocked: await isOrgBillingBlocked(user.organizationId),
    org,
    currentPlan: plan ?? null,
    plans: await listActivePlans(),
    usage: {
      seats: { current: seats.current, limit: seats.limit },
      projects: { current: projectsUsage.current, limit: projectsUsage.limit },
    },
  });
}
