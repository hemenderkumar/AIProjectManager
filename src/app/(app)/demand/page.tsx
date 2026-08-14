import { getCurrentUser } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/modules-server";
import { MODULE_REGISTRY } from "@/lib/modules";
import ModuleLocked from "@/components/ModuleLocked";
import DemandPageClient from "./DemandPageClient";

// Thin server wrapper -- the actual page (client component, needs useState/useEffect) lives
// in DemandPageClient.tsx. This just enforces the plan-tier module gate before rendering it,
// so hiding the sidebar link (cosmetic) isn't the only thing standing between a locked-out
// org and this page. See lib/modules.ts / lib/modules-server.ts.
export default async function DemandPage() {
  const user = await getCurrentUser();
  const enabled = await isModuleEnabled(user, "demand");
  if (!enabled) return <ModuleLocked moduleName={MODULE_REGISTRY.demand.label} />;
  return <DemandPageClient />;
}
