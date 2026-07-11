import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projectResources } from "@/lib/db/schema";
import { requireProjectAccess } from "@/lib/tenancy";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const _authUser = await requireProjectAccess("CONTRIBUTOR", id);
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
