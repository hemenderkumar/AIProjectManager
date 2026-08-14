import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { listWebhooks, createWebhook } from "@/lib/webhooks";

export async function GET() {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await listWebhooks(user);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.url || !Array.isArray(body.events) || !body.events.length) {
    return NextResponse.json({ error: "url and at least one event are required" }, { status: 400 });
  }
  const created = await createWebhook(user, body.url, body.events);
  return NextResponse.json(created, { status: 201 });
}
