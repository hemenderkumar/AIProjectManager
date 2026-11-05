import { eq } from "drizzle-orm";
import { db } from "./db";
import { incidents, projects } from "./db/schema";
import { sendEmail } from "./email";
import { sendBrandedEmail } from "./brandedEmail";

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// Extracts a usable email from a free-text reporter ("Jane <jane@x.com>" or "jane@x.com").
export function extractEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(raw);
  const candidate = (m ? m[1] : raw).trim();
  return EMAIL_RE.test(candidate) ? candidate.toLowerCase() : null;
}

// Emails the person who reported the incident (best-effort -- never throws) and stamps
// lastReporterUpdateAt so the cadence nudge knows they've been kept in the loop.
export async function notifyReporter(incidentId: string, opts: { subject: string; heading: string; paragraphs: string[] }) {
  try {
    const [inc] = await db.select().from(incidents).where(eq(incidents.id, incidentId));
    const to = inc?.reporterEmail;
    if (!inc || !to) return false;

    let orgId: string | null = null;
    if (inc.projectId) {
      const [p] = await db.select({ organizationId: projects.organizationId }).from(projects).where(eq(projects.id, inc.projectId));
      orgId = p?.organizationId ?? null;
    }
    const subject = `${opts.subject} [${inc.id.slice(0, 8)}]`;
    const ref = [`Reference: ${inc.title}`, ...opts.paragraphs];
    const ok = orgId
      ? await sendBrandedEmail({ organizationId: orgId, to, subject, heading: opts.heading, paragraphs: ref })
      : await sendEmail(to, subject, [opts.heading, "", ...ref].join("\n"));
    if (ok) await db.update(incidents).set({ lastReporterUpdateAt: new Date() }).where(eq(incidents.id, incidentId));
    return ok;
  } catch (err) {
    console.error("notifyReporter failed", err);
    return false;
  }
}
