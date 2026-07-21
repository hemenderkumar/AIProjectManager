import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";

type KeelConnectProjectDraft = {
  title: string;
  description: string;
  category: string;
  targetBudget: number;
  currency: string;
  engagementModel: "MARKETPLACE" | "MEDIATOR";
  locationRequirement: "GLOBAL" | "RESTRICTED";
};

// KeelConnect's own "rough note -> structured record" AI drafting endpoint -- the same
// pattern Keel Deliver already uses for tasks/risks/etc. (see draft-task/route.ts), but
// aimed at what a Client actually needs when posting outsourced work to the marketplace:
// a clear external-facing title/description, a category, a realistic budget, and whether
// the engagement should run direct (marketplace) or Keel-mediated on both sides.
//
// Optionally seeded from an existing Keel Deliver task (see the post-to-keelconnect bridge
// route), in which case `note` already contains that task's title/description/estimate as
// context -- either way this endpoint only ever sees free text, never a task/project id, so
// it stays usable standalone from the KeelConnect "Post a project" form too.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (!note) {
    return NextResponse.json({ error: "Describe the work first, then draft with AI." }, { status: 400 });
  }

  const system = `You are helping a Client organization post a project to KeelConnect, a B2B
marketplace where vetted Vendor organizations bid on outsourced work. Turn their rough note into a
properly formed, externally-facing project posting -- remember Vendors browsing the marketplace have
none of the Client's internal context, so the description must stand alone and read professionally.

Rough note from the Client:
"""
${note}
"""

Respond as JSON: { "title": a clear, specific external-facing title (not vague, e.g. "Migrate legacy
PHP billing system to a modern stack" not "Backend work"), "description": 2-4 sentences a Vendor could
bid from with no other context -- what needs to be done, any constraints or must-haves, "category": a
short category label (e.g. "Web Development", "Data Engineering", "Security Audit", "Electrical
Contracting"), "targetBudget": a reasonable rough total budget in USD as a plain number reasoned from
the scope described (0 if truly nothing to go on), "currency": "USD" unless another currency is clearly
implied, "engagementModel": "MARKETPLACE" (Client and Vendor contract directly once a bid is accepted)
by default, or "MEDIATOR" only if the note implies wanting Keel itself as the contracting party on both
sides, "locationRequirement": "GLOBAL" by default, or "RESTRICTED" only if the note mentions needing
vendors from specific countries/regions (e.g. data residency, on-site work, licensing) }`;

  const { data, error } = await askClaudeJSON<KeelConnectProjectDraft>(system, "Draft this project posting now.", 1200);

  if (error || !data) {
    return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });
  }

  return NextResponse.json(data);
}
