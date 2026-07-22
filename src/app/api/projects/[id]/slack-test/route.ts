import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireProjectAccess } from "@/lib/tenancy";
import { sendSlackMessage } from "@/lib/slack";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await requireProjectAccess("PM", id);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [project] = await db
    .select({ name: projects.name, slackWebhookUrl: projects.slackWebhookUrl })
    .from(projects)
    .where(eq(projects.id, id));
  if (!project?.slackWebhookUrl) {
    return NextResponse.json({ error: "No Slack webhook is configured for this project yet." }, { status: 400 });
  }

  const ok = await sendSlackMessage(
    project.slackWebhookUrl,
    `Keel is now connected to Slack for "${project.name}". Task activity will post here.`
  );
  if (!ok) return NextResponse.json({ error: "Slack rejected that message — double check the webhook URL." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
