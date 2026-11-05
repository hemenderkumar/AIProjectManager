import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { suggestionsForIncident, linkIncidentToProblem } from "@/lib/problems";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const result = await suggestionsForIncident(user, id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 403 });
  return NextResponse.json(result);
}

// Link (or unlink with problemId: null) an incident to an existing problem.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const problemId = typeof body.problemId === "string" && body.problemId ? body.problemId : null;
  const result = await linkIncidentToProblem(user, id, problemId);
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 403 });
  return NextResponse.json(result.incident);
}
