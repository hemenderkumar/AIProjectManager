import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { askClaude } from "@/lib/ai";
import { db } from "@/lib/db";
import { sows, deliverables } from "@/lib/db/schema";
import { getProjectDetail } from "@/lib/portfolio";
import { requireProjectAccess } from "@/lib/tenancy";
import { summarizeProjectCore, summarizeSows, summarizeDeliverables } from "@/lib/projectContext";

// A project-scoped "ask a question" endpoint — narrower than the portfolio-wide /api/ai/ask,
// grounded ONLY in this one project's charter, tasks, risks, milestones, comms, SOWs, and
// deliverables. No persistence: each call is answered fresh from current data, and the UI
// keeps conversation history client-side only (see QaTab.tsx).
export async function POST(req: NextRequest) {
  const { projectId, question } = await req.json().catch(() => ({}));
  if (!projectId || !question?.trim()) {
    return NextResponse.json({ error: "projectId and question are required" }, { status: 400 });
  }

  const user = await requireProjectAccess("VIEWER", projectId);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const detail = await getProjectDetail(projectId);
  if (!detail) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const [sowRows, deliverableRows] = await Promise.all([
    db.select().from(sows).where(eq(sows.projectId, projectId)),
    db.select().from(deliverables).where(eq(deliverables.projectId, projectId)),
  ]);

  const context = `${summarizeProjectCore(detail)}

Statements of Work:
${summarizeSows(sowRows)}

Deliverables:
${summarizeDeliverables(deliverableRows)}`;

  const system = `You are Keel's project assistant, answering a teammate's question about ONE specific
project using ONLY the context below. If the answer genuinely isn't in this context, say so plainly rather
than guessing or inventing numbers, dates, or names that aren't given. Keep the answer concise — a few
sentences, or a short list if the question calls for one.

Project context:
${context}`;

  const answer = await askClaude(system, question, 1000);
  return NextResponse.json({ answer });
}
