import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getProblem, patchProblem, createProblemFixTask, noteOnLinkedIncidents } from "@/lib/problems";
import { notifyReporter } from "@/lib/incidentComms";
import { db } from "@/lib/db";
import { incidents } from "@/lib/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";

const STATUS = { not_found: 404, forbidden: 403 } as Record<string, number>;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("VIEWER");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const result = await getProblem(user, id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json(result);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const before = await getProblem(user, id);
  if (before.error) return NextResponse.json({ error: before.error }, { status: STATUS[before.error] ?? 400 });

  const result = await patchProblem(user, id, body);
  if (result.error) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });

  const p = result.problem;
  // Proactive notice: the moment a problem becomes a known error (or is fixed for good), tell
  // every affected reporter on still-open linked incidents.
  const becameKnown = p.status === "KNOWN_ERROR" && before.problem.status !== "KNOWN_ERROR";
  const becameResolved = p.status === "RESOLVED" && before.problem.status !== "RESOLVED";
  if (becameKnown || becameResolved) {
    const affected = await db
      .select({ id: incidents.id, status: incidents.status })
      .from(incidents)
      .where(and(eq(incidents.problemId, id), isNotNull(incidents.reporterEmail)));
    const open = affected.filter((a) => a.status !== "RESOLVED" && a.status !== "CLOSED");
    if (becameKnown) {
      await noteOnLinkedIncidents(id, user.name, `Problem "${p.title}" is now a known error.${p.workaround ? ` Workaround: ${p.workaround}` : ""}`);
      for (const a of open) {
        await notifyReporter(a.id, {
          subject: "Update: we've identified the cause",
          heading: "We've identified the cause",
          paragraphs: [
            `We've traced this to a known problem ("${p.title}") and are working on a permanent fix.`,
            ...(p.workaround ? [`In the meantime, this workaround may help: ${p.workaround}`] : []),
          ],
        });
      }
    } else {
      await noteOnLinkedIncidents(id, user.name, `Problem "${p.title}" has been permanently resolved.`);
      for (const a of open) {
        await notifyReporter(a.id, {
          subject: "A permanent fix is in place",
          heading: "A permanent fix has been applied",
          paragraphs: [`The underlying problem ("${p.title}") has been fixed. If you're still affected, reply to this email.`],
        });
      }
    }
  }
  return NextResponse.json(p);
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("PM");
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const result = await createProblemFixTask(user, id);
  if (result.error) return NextResponse.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
  return NextResponse.json(result.task, { status: 201 });
}
