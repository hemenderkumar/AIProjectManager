import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { triageDemand, scoreDemand, decideDemand, convertDemand } from "@/lib/demand";

// One PATCH endpoint, disambiguated by body.action, covering the whole triage -> score ->
// decide -> convert workflow -- each step is a small state transition on the same row, not
// separate resources.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  if (body.action === "triage") {
    const updated = await triageDemand(id, body.notes ?? "", body.isDuplicateOfId);
    return NextResponse.json(updated);
  }
  if (body.action === "score") {
    if (typeof body.businessValueScore !== "number" || typeof body.urgencyScore !== "number" || !body.effortTshirtSize) {
      return NextResponse.json({ error: "businessValueScore, urgencyScore, and effortTshirtSize are required" }, { status: 400 });
    }
    const updated = await scoreDemand(id, body.businessValueScore, body.urgencyScore, body.effortTshirtSize);
    return NextResponse.json(updated);
  }
  if (body.action === "decide") {
    if (!["APPROVED", "DEFERRED", "REJECTED"].includes(body.decision)) {
      return NextResponse.json({ error: "decision must be APPROVED, DEFERRED, or REJECTED" }, { status: 400 });
    }
    const updated = await decideDemand(user, id, body.decision, body.reason ?? "", body.capacityNotes);
    return NextResponse.json(updated);
  }
  if (body.action === "convert") {
    const project = await convertDemand(user, id);
    if (!project) return NextResponse.json({ error: "Only an APPROVED request can be converted" }, { status: 400 });
    return NextResponse.json(project);
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
