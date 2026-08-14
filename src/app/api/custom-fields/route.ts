import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listFieldDefinitions, createFieldDefinition } from "@/lib/customFields";

export async function GET(req: NextRequest) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const entity = (req.nextUrl.searchParams.get("entity") ?? "TASK") as "PROJECT" | "TASK" | "RISK" | "DELIVERABLE";
  const projectId = req.nextUrl.searchParams.get("projectId");
  const data = await listFieldDefinitions(user, entity, projectId);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.entity || !body.fieldKey || !body.label) {
    return NextResponse.json({ error: "entity, fieldKey, and label are required" }, { status: 400 });
  }
  const created = await createFieldDefinition(user, body);
  return NextResponse.json(created, { status: 201 });
}
