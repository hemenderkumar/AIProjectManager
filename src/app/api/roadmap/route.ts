import { NextResponse } from "next/server";
import { requireRole, roleAtLeast } from "@/lib/auth";
import { listRoadmaps, getEligibleIdeasForRoadmap, summarizeEligibleIdeas } from "@/lib/roadmap";

export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [roadmapList, eligible] = await Promise.all([listRoadmaps(user), getEligibleIdeasForRoadmap(user)]);
  const eligibleIdeas = await summarizeEligibleIdeas(eligible);

  return NextResponse.json({
    roadmaps: roadmapList,
    eligibleIdeas,
    eligibleCount: eligibleIdeas.length,
    canGenerate: ["PM", "SUPER_USER", "ADMIN"].includes(user.role),
    // Same role floor /api/rfps/route.ts requires to create an RFP -- gates the "Draft RFP"
    // shortcut button on each roadmap item so it's never shown to a role that would just get a
    // 403 clicking it.
    canDraftRfp: roleAtLeast(user.role, "SUPER_USER"),
  });
}
