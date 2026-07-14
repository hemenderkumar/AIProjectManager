import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";

// Fire-and-forget beacon for logging a visit to a public, no-login page from client
// components (the login page) where there's no server component to log it directly from.
// Deliberately takes no reference to who's calling — this is traffic counting, not auth.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const path = typeof body?.path === "string" ? body.path.slice(0, 200) : undefined;
  await logActivity({ type: "PUBLIC_VISIT", path });
  return NextResponse.json({ ok: true });
}
