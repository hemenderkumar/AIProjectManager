import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listEmailRoutes, createEmailRoute } from "@/lib/emailIntake";

export async function GET() {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await listEmailRoutes(user);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const created = await createEmailRoute(user, {
      projectId: body.projectId || null,
      defaultSeverity: body.defaultSeverity || "MEDIUM",
      defaultAssigneeUserId: body.defaultAssigneeUserId || null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create email intake address" }, { status: 400 });
  }
}
