import type { getProjectDetail } from "./portfolio";

export type ProjectDetailResult = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>;

// Shared by the newer "insight" AI endpoints (SOW drift, project chat, similar-projects) that
// all need a compact, consistent picture of where a project actually stands — as opposed to
// draft-deliverable/draft-sow's own buildProjectContext(), which is charter-focused since those
// are drafting a NEW document rather than assessing an existing one.
export function summarizeProjectCore(detail: ProjectDetailResult): string {
  const p = detail.project;
  const openRisks = detail.risks.filter((r) => r.status !== "CLOSED");
  const now = new Date();
  const taskStats = {
    total: detail.tasks.length,
    done: detail.tasks.filter((t) => t.status === "DONE").length,
    overdue: detail.tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== "DONE").length,
  };
  const latestUpdate = detail.statusUpdates[0];
  const recentComms = detail.communications.slice(0, 5);

  return `Project: ${p.name} (stage: ${p.stage}, RAG: ${detail.autoRag}, % complete: ${p.percentComplete}%)
Description: ${p.description || "(none)"}
Business case: ${p.businessCase || "(not yet defined)"}
Scope (in): ${p.scopeInScope || "(not yet defined)"}
Scope (out): ${p.scopeOutOfScope || "(not yet defined)"}
Proposed solution: ${p.proposedSolution || "(not yet defined)"}
Recommended technology: ${p.recommendedTechnology || "(not yet decided)"}
Timeline: start ${p.startDate?.toDateString() ?? "n/a"}, target end ${p.targetEndDate?.toDateString() ?? "n/a"}
Budget: planned $${p.budgetPlanned ?? 0}, actual $${p.budgetActual ?? 0}
Tasks: ${taskStats.total} total, ${taskStats.done} done, ${taskStats.overdue} overdue
Open risks (${openRisks.length}): ${
    openRisks.slice(0, 15).map((r) => `"${r.description}" (impact: ${r.impact}, likelihood: ${r.likelihood})`).join("; ") || "none"
  }
Milestones: ${
    detail.milestones.slice(0, 15).map((m) => `${m.name} — ${m.status}${m.dueDate ? ` (due ${m.dueDate.toDateString()})` : ""}`).join("; ") || "(none)"
  }
Latest status update: ${latestUpdate ? `${latestUpdate.ragStatus}, ${latestUpdate.percentComplete}% — ${latestUpdate.summary || "(no summary)"}` : "(none logged)"}
Recent communications: ${recentComms.length ? recentComms.map((c) => `${c.type}: ${c.summary || "(no summary)"}`).join("; ") : "(none logged)"}`;
}

export function summarizeSows(
  sowRows: { title: string; vendorName: string; status: string; timeline: string | null; fundingAmount: number | null }[]
): string {
  if (!sowRows.length) return "(no SOWs yet)";
  return sowRows
    .map(
      (s) =>
        `- "${s.title}" with ${s.vendorName} [${s.status}]${s.timeline ? `, timeline: ${s.timeline}` : ""}${
          s.fundingAmount != null ? `, funding: $${s.fundingAmount.toLocaleString()}` : ""
        }`
    )
    .join("\n");
}

export function summarizeDeliverables(deliverableRows: { title: string; type: string; status: string }[]): string {
  if (!deliverableRows.length) return "(no deliverables yet)";
  return deliverableRows.map((d) => `- ${d.title} [${d.type}, ${d.status}]`).join("\n");
}
