import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";

// Internal sink for middleware.ts's PAGE_VIEW and ACTION events. Middleware runs on the
// Edge runtime and can't talk to Postgres directly, so it decodes the session there (Edge-
// safe, see lib/session-edge.ts) and fires a background request here -- a normal Node
// serverless function with full DB access -- via event.waitUntil() so it never blocks the
// actual page/API response. Not itself authenticated beyond "did middleware call it": the
// worst case of someone hitting this directly is a fake row in a traffic-counting table,
// same trust level as the existing /api/activity/ping endpoint.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const type = body?.type === "ACTION" ? "ACTION" : body?.type === "PAGE_VIEW" ? "PAGE_VIEW" : null;
  if (!type) return NextResponse.json({ ok: false }, { status: 400 });

  const path = typeof body?.path === "string" ? body.path.slice(0, 200) : undefined;
  const detail = typeof body?.detail === "string" ? body.detail.slice(0, 200) : undefined;
  const userId = typeof body?.userId === "string" ? body.userId : null;
  const userName = typeof body?.userName === "string" ? body.userName : null;

  await logActivity({ type, userId, userName, path, detail });
  return NextResponse.json({ ok: true });
}
