import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listRules, createRule } from "@/lib/automation";

export async function GET(req: NextRequest) {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const projectId = req.nextUrl.searchParams.get("projectId");
  const data = await listRules(user, projectId);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.name || !body.trigger || !Array.isArray(body.actions)) {
    return NextResponse.json({ error: "name, trigger, and actions are required" }, { status: 400 });
  }
  const created = await createRule(user, body);
  return NextResponse.json(created, { status: 201 });
}
