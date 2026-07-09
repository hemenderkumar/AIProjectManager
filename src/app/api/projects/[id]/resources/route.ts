import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectResources } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  if (!body.resourceId) {
    return NextResponse.json({ error: "resourceId is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(projectResources)
    .values({
      projectId: id,
      resourceId: body.resourceId,
      allocationPercent: body.allocationPercent ?? 100,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
