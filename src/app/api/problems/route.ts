import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listProblems, createProblemFromIncidents, recurrenceCandidates } from "@/lib/problems";

export async function GET(req: NextRequest) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.nextUrl.searchParams.get("candidates") === "1") {
    return NextResponse.json(await recurrenceCandidates(user));
  }
  return NextResponse.json(await listProblems(user));
}

export async function POST(req: NextRequest) {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.incidentIds) ? body.incidentIds.filter((x: unknown): x is string => typeof x === "string") : [];
  const result = await createProblemFromIncidents(user, ids, { title: body.title, description: body.description });
  if ("error" in result) {
    const status = result.error === "forbidden" ? 403 : result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json(result.problem, { status: 201 });
}
