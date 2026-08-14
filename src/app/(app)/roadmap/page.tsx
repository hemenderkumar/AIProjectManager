import { getCurrentUser } from "@/lib/auth";
import { isModuleEnabled } from "@/lib/modules-server";
import { MODULE_REGISTRY } from "@/lib/modules";
import ModuleLocked from "@/components/ModuleLocked";
import RoadmapPageClient from "./RoadmapPageClient";

// Thin server wrapper -- see the matching comment in demand/page.tsx.
export default async function RoadmapPage() {
  const user = await getCurrentUser();
  const enabled = await isModuleEnabled(user, "roadmap");
  if (!enabled) return <ModuleLocked moduleName={MODULE_REGISTRY.roadmap.label} />;
  return <RoadmapPageClient />;
}
