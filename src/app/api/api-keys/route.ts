import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listApiKeys, createApiKey } from "@/lib/apiKeys";

export async function GET() {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await listApiKeys(user);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const created = await createApiKey(user, body.name);
  return NextResponse.json(created, { status: 201 });
}
