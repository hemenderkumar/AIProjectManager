import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listIncidentUpdates, addIncidentUpdate } from "@/lib/incidents";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const result = await listIncidentUpdates(user, id);
  if ("error" in result) {
    return NextResponse.json({ error: result.error === "not_found" ? "not found" : "Forbidden" }, { status: result.error === "not_found" ? 404 : 403 });
  }
  return NextResponse.json(result.updates);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.body || !String(body.body).trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const result = await addIncidentUpdate(user, id, String(body.body));
  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result.update, { status: 201 });
}
