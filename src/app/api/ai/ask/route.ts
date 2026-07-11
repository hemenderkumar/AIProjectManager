import { NextRequest, NextResponse } from "next/server";
import { askClaude } from "@/lib/ai";
import { getPortfolioSummary, formatPortfolioForAI } from "@/lib/portfolio";
import { requireRole } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const _authUser = await requireRole("CONTRIBUTOR");
  if (!_authUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { question } = await req.json();
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 });
  }

  const summary = await getPortfolioSummary(_authUser);
  const context = formatPortfolioForAI(summary);

  const system = `You are an AI project management assistant embedded in a KPI-driven project tracker.
You have access to live portfolio data below. Answer the user's question directly, referencing
specific projects, KPIs, risks, or status where relevant. Be concise and actionable, and speak
like an experienced PMO lead. If asked to prioritize or recommend actions, be decisive.

${context}`;

  const answer = await askClaude(system, question);
  return NextResponse.json({ answer });
}
