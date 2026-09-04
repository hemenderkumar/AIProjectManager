import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listIncidents, createIncident } from "@/lib/incidents";

export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await listIncidents(user);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.title || !String(body.title).trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const result = await createIncident(user, body);
  if ("error" in result) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(result.incident, { status: 201 });
}
