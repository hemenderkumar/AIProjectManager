import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getRoadmapDetail } from "@/lib/roadmap";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getRoadmapDetail(id, user);
  if (!detail) return NextResponse.json({ error: "Roadmap not found" }, { status: 404 });

  return NextResponse.json({ roadmap: detail });
}
