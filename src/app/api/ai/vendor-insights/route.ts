import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import { getVendorScorecards } from "@/lib/vendorScorecard";

type VendorInsightResult = { summary: string; standouts: string[] };

export async function POST(req: NextRequest) {
  const user = await requireRole("SUPER_USER"); // roleAtLeast also passes ADMIN through
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  let organizationId: string;
  if (user.role === "ADMIN") {
    if (!body.organizationId) return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    organizationId = body.organizationId;
  } else {
    if (!user.organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    organizationId = user.organizationId;
  }

  const scorecards = await getVendorScorecards(organizationId);
  if (scorecards.length < 2) {
    return NextResponse.json<VendorInsightResult>({
      summary: "Not enough vendor history yet to compare — sign SOWs with at least two different vendors first.",
      standouts: [],
    });
  }

  const list = scorecards
    .map(
      (v) =>
        `- ${v.vendorName}: ${v.sowCount} SOW(s), status mix ${JSON.stringify(v.statusBreakdown)}, total funding $${v.totalFunding.toLocaleString()}${
          v.testPassRate != null ? `, test pass rate ${v.testPassRate}%` : ""
        }, projects: ${v.projects.join(", ")}`
    )
    .join("\n");

  const system = `You compare vendor performance across a company's Statements of Work to help decide who to
re-engage for future work. Data:
${list}

Respond as JSON: { "summary": string (2-3 sentences on the overall pattern across vendors), "standouts":
string[] (0-4 short call-outs naming a specific vendor and why it stands out, positively or negatively —
e.g. low test pass rate, funding well above peers, consistently signed vs. stuck in draft) }`;

  const { data, error } = await askClaudeJSON<VendorInsightResult>(system, "Compare vendor performance now.", 1500);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  return NextResponse.json(data);
}
