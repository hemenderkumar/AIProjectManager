import { getCurrentUser } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/modules-server";
import { MODULE_REGISTRY } from "@/lib/modules";
import ModuleLocked from "@/components/ModuleLocked";
import AutomationsPageClient from "./AutomationsPageClient";

// Thin server wrapper -- see the matching comment in demand/page.tsx.
export default async function AutomationsPage() {
  const user = await getCurrentUser();
  const enabled = await isModuleEnabled(user, "automations");
  if (!enabled) return <ModuleLocked moduleName={MODULE_REGISTRY.automations.label} />;
  return <AutomationsPageClient />;
}
