import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { incidents } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth";

export async function GET() {
  const _authUser = await requireRole("VIEWER");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await db.select().from(incidents);
  return NextResponse.json(rows.sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime()));
}

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const [created] = await db
    .insert(incidents)
    .values({
      projectId: body.projectId || null,
      title: body.title,
      description: body.description || null,
      severity: body.severity || "MEDIUM",
      status: body.status || "OPEN",
      reportedBy: body.reportedBy || null,
      assignee: body.assignee || null,
      reportedAt: body.reportedAt ? new Date(body.reportedAt) : new Date(),
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
