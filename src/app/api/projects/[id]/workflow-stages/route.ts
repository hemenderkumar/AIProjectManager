import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/tenancy";
import { listWorkflowStages, createWorkflowStage } from "@/lib/customFields";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await listWorkflowStages(id);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const created = await createWorkflowStage(id, body.name, body.color);
  return NextResponse.json(created, { status: 201 });
}
