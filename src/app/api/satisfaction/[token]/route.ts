import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { satisfactionSurveys } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json();

  const [survey] = await db.select().from(satisfactionSurveys).where(eq(satisfactionSurveys.token, token));
  if (!survey) return NextResponse.json({ error: "This link is invalid or has expired" }, { status: 404 });
  if (survey.status === "COMPLETED") {
    return NextResponse.json({ error: "This survey was already submitted" }, { status: 400 });
  }

  const npsScore = body.npsScore === "" || body.npsScore == null ? null : Number(body.npsScore);
  const csatScore = body.csatScore === "" || body.csatScore == null ? null : Number(body.csatScore);
  if (npsScore != null && (!Number.isFinite(npsScore) || npsScore < 0 || npsScore > 10)) {
    return NextResponse.json({ error: "npsScore must be 0-10" }, { status: 400 });
  }
  if (csatScore != null && (!Number.isFinite(csatScore) || csatScore < 1 || csatScore > 5)) {
    return NextResponse.json({ error: "csatScore must be 1-5" }, { status: 400 });
  }
  if (npsScore == null && csatScore == null) {
    return NextResponse.json({ error: "Answer at least one question" }, { status: 400 });
  }

  await db
    .update(satisfactionSurveys)
    .set({
      status: "COMPLETED",
      npsScore,
      csatScore,
      comments: body.comments || null,
      respondedAt: new Date(),
    })
    .where(eq(satisfactionSurveys.id, survey.id));

  return NextResponse.json({ ok: true });
}
