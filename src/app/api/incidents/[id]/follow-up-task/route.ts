import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createFollowUpTask } from "@/lib/incidents";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const result = await createFollowUpTask(user, id, { title: body.title, description: body.description });
  if ("error" in result) {
    if (result.error === "not_found") return NextResponse.json({ error: "not found" }, { status: 404 });
    if (result.error === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.error === "no_project") return NextResponse.json({ error: "This incident isn't linked to a project" }, { status: 400 });
    return NextResponse.json({ error: "A follow-up task already exists", followUpTaskId: result.followUpTaskId }, { status: 409 });
  }
  return NextResponse.json(result.task, { status: 201 });
}
