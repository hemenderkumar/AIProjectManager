import { db } from "./db";
import { organizations, plans } from "./db/schema";
import { eq } from "drizzle-orm";
import type { SessionUser } from "./auth";
import { type ModuleKey } from "./modules";

// Null (no plan selected yet, or the plan's enabledModules was never set) means "everything
// enabled" -- same backward-compatible default reasoning as every other nullable plan field.
// Internal Executa staff (organizationId null) are never gated; module tiering only applies
// to client organizations.
export async function getEnabledModules(user: SessionUser | null): Promise<ModuleKey[] | null> {
  if (!user?.organizationId) return null;
  const [org] = await db.select({ planId: organizations.planId }).from(organizations).where(eq(organizations.id, user.organizationId));
  if (!org?.planId) return null;
  const [plan] = await db.select({ enabledModules: plans.enabledModules }).from(plans).where(eq(plans.id, org.planId));
  return (plan?.enabledModules as ModuleKey[] | null) ?? null;
}

export async function isModuleEnabled(user: SessionUser | null, key: ModuleKey): Promise<boolean> {
  const enabled = await getEnabledModules(user);
  return enabled === null || enabled.includes(key);
}
