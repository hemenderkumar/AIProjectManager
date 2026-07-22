import { db } from "./db";
import { projects } from "./db/schema";
import { eq } from "drizzle-orm";

// Plain incoming-webhook POST -- no OAuth app, no Slack SDK, matches this codebase's existing
// "raw HTTP call, return a boolean, never throw" convention for third-party notification sinks
// (see sendEmail in ./email.ts). Always called fire-and-forget from the caller's side.
export async function sendSlackMessage(webhookUrl: string, text: string): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Fire-and-forget Slack post for a project event -- looks up that project's webhook itself so
// call sites (task create/update/comment routes) don't need to already have the project row in
// hand, and silently no-ops if the project never configured one.
export async function notifySlackForProject(projectId: string, text: string): Promise<void> {
  const [project] = await db
    .select({ slackWebhookUrl: projects.slackWebhookUrl })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project?.slackWebhookUrl) return;
  await sendSlackMessage(project.slackWebhookUrl, text);
}
