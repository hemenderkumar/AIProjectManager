import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listRoadmaps, getEligibleIdeasForRoadmap } from "@/lib/roadmap";

export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [roadmaps, eligibleIdeas] = await Promise.all([listRoadmaps(user), getEligibleIdeasForRoadmap(user)]);

  return NextResponse.json({
    roadmaps,
    eligibleCount: eligibleIdeas.length,
    canGenerate: ["PM", "SUPER_USER", "ADMIN"].includes(user.role),
  });
}
