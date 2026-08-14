import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listDemand, submitDemand } from "@/lib/demand";

export async function GET() {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await listDemand(user);
  return NextResponse.json(data);
}

// Public — no login required, same principle as /api/auth/register: the front door has to
// be usable by anyone, not just people who already have an Executa account.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const title = String(body.title ?? "").trim();
  const description = String(body.description ?? "").trim();
  const requestedByName = String(body.requestedByName ?? "").trim();
  const requestedByEmail = String(body.requestedByEmail ?? "").trim().toLowerCase();

  if (!title || !description || !requestedByName || !requestedByEmail) {
    return NextResponse.json({ error: "Title, description, your name, and email are all required" }, { status: 400 });
  }

  const created = await submitDemand({ title, description, requestedByName, requestedByEmail, type: body.type });
  return NextResponse.json(created, { status: 201 });
}
