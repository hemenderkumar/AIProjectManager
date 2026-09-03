import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityEvents } from "@/lib/db/schema";
import { triageIntake } from "@/lib/triage";
import { logActivity } from "@/lib/activity";

const MAX_TEXT_LENGTH = 600;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 8; // attempts per IP per window -- generous for a real visitor trying
// a couple of examples, tight enough to blunt a script hammering the AI endpoint for free.

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Public, no-login sibling of /api/ai/triage -- powers the homepage teaser so a visitor can
// see Executa classify their own idea/demand/project before they've created an account. Same
// prompt (lib/triage.ts), but reachable by anyone, so unlike the authenticated route this
// bounds input size and rate-limits by IP using the existing activity_events log (counts both
// successful and failed attempts, so retries against errors still count).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Describe what's on your mind first." }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json({ error: `Keep it under ${MAX_TEXT_LENGTH} characters.` }, { status: 400 });
  }

  const ip = clientIp(req);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recent = await db
    .select({ id: activityEvents.id })
    .from(activityEvents)
    .where(and(eq(activityEvents.type, "PUBLIC_TRIAGE"), eq(activityEvents.detail, `ip:${ip}`), gte(activityEvents.createdAt, windowStart)));

  if (recent.length >= RATE_LIMIT_MAX) {
    return NextResponse.json({ error: "You've tried this a few times already — give it a few minutes and try again." }, { status: 429 });
  }

  await logActivity({ type: "PUBLIC_TRIAGE", path: "/", detail: `ip:${ip}` });

  const { data, error } = await triageIntake(text);
  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
