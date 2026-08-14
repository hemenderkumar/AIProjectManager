import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taskGithubLinks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const user = await requireProjectAccess("VIEWER", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await db.select().from(taskGithubLinks).where(eq(taskGithubLinks.taskId, taskId));
  return NextResponse.json(data);
}

// v1 is a link, not a sync: we store the repo/number/url and show it, but nothing polls
// GitHub for status changes. See the column comment on taskGithubLinks in schema.ts for why
// that's the deliberate scope for now.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const user = await requireProjectAccess("CONTRIBUTOR", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.repo || !body.issueOrPrNumber || !body.url) {
    return NextResponse.json({ error: "repo, issueOrPrNumber, and url are required" }, { status: 400 });
  }
  const [created] = await db
    .insert(taskGithubLinks)
    .values({
      taskId,
      repo: body.repo,
      issueOrPrNumber: Number(body.issueOrPrNumber),
      linkType: body.linkType === "PR" ? "PR" : "ISSUE",
      url: body.url,
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
