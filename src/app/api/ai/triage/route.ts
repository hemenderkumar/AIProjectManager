import { NextRequest, NextResponse } from "next/server";
import { triageIntake } from "@/lib/triage";
import { requireRole } from "@/lib/auth";

// Backs the "What's on your mind?" wizard on /home -- the single free-text entry point that
// stands in for having to already know Executa's own vocabulary (is this a Demand, an Idea,
// or a Project?) before you've even used the product. The user just describes the thing in
// their own words; this classifies it into whichever of the three it actually is and drafts
// the fields that entity needs, so the wizard can create it with one confirm click. The user
// still sees and can override the classification before anything is created -- same
// propose-then-confirm pattern as the rest of the app's AI-drafting flows (AiEditChat,
// draft-incident, etc.), just for "what kind of thing is this" instead of "what changed."
//
// See /api/public/triage for the no-login sibling used by the homepage teaser -- same prompt
// (shared via lib/triage.ts), different auth/rate-limit posture.
export async function POST(req: NextRequest) {
  const user = await requireRole("CONTRIBUTOR");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Describe what's on your mind first." }, { status: 400 });
  }

  const { data, error } = await triageIntake(text);

  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
