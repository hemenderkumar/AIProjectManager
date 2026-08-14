import { getCurrentUser } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/modules-server";
import { MODULE_REGISTRY } from "@/lib/modules";
import ModuleLocked from "@/components/ModuleLocked";
import IntegrationsPageClient from "./IntegrationsPageClient";

// Thin server wrapper -- see the matching comment in demand/page.tsx.
export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  const enabled = await isModuleEnabled(user, "integrations");
  if (!enabled) return <ModuleLocked moduleName={MODULE_REGISTRY.integrations.label} />;
  return <IntegrationsPageClient />;
}
