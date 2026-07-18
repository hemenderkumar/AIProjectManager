import Link from "next/link";
import Topbar from "@/components/Topbar";
import { RagBadge, StageBadge, PriorityBadge } from "@/components/badges";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { getCurrentUser } from "@/lib/auth";
import ApproveIdeaButton from "@/components/ApproveIdeaButton";
import ExportButtons from "@/components/ExportButtons";
import { PlusCircle, Rocket, Lightbulb } from "lucide-react";

export const dynamic = "force-dynamic";

const EXECUTION_STAGES = ["EXECUTION", "CLOSING", "CLOSED"];

export default async function ExecutionPage() {
  const user = await getCurrentUser();
  const all = await getAllProjectsWithMetrics(user);
  const readyToApprove = all.filter((p) => p.stage === "CHARTER");
  const inExecution = all
    .filter((p) => EXECUTION_STAGES.includes(p.stage))
    .sort((a, b) => {
      if (a.stage === "CLOSED" && b.stage !== "CLOSED") return 1;
      if (b.stage === "CLOSED" && a.stage !== "CLOSED") return -1;
      const order = { RED: 0, YELLOW: 1, GREEN: 2 } as Record<string, number>;
      return order[a.autoRag] - order[b.autoRag];
    });

  return (
    <div>
      <Topbar
        title="Project Execution"
        subtitle="Continue an approved idea, or start a brand-new project"
        action={<ExportButtons endpoint="/api/reports/execution" filenamePrefix="execution" />}
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={18} className="text-accent-600" />
              <p className="text-sm font-semibold text-slate-900">Continue from an Approved Idea</p>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Ideas with a completed charter, ready to approve and move into execution — nothing gets
              re-entered, the same project record continues with everything already built (charter,
              estimates, resources).
            </p>
            {readyToApprove.length === 0 ? (
              <p className="text-xs text-slate-400">
                No ideas are charter-ready yet. Work through them on the{" "}
                <Link href="/ideation" className="text-accent-600 hover:underline">Ideation</Link> page.
              </p>
            ) : (
              <div className="space-y-2">
                {readyToApprove.map((p) => (
                  <div key={p.id} className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                    <div>
                      <Link href={`/projects/${p.id}`} className="text-sm font-medium text-slate-800 hover:text-accent-600">
                        {p.name}
                      </Link>
                      <p className="text-xs text-slate-400">
                        Est. budget ${(p.budgetPlanned ?? 0).toLocaleString()}
                        {p.sponsor ? ` · Sponsor: ${p.sponsor}` : ""}
                      </p>
                    </div>
                    <ApproveIdeaButton projectId={p.id} hasTasks={p.taskCount > 0} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Rocket size={18} className="text-accent-600" />
              <p className="text-sm font-semibold text-slate-900">Start a New Project</p>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Skip ideation and go straight into execution with a fresh project — the AI planner is ready
              as soon as it&apos;s created.
            </p>
            <Link
              href="/projects/new"
              className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
            >
              <PlusCircle size={16} />
              New Project
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">In Execution ({inExecution.length})</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Health</th>
                <th className="px-4 py-2.5 font-medium">% Complete</th>
                <th className="px-4 py-2.5 font-medium">Budget (Actual/Planned)</th>
              </tr>
            </thead>
            <tbody>
              {inExecution.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-accent-600">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><StageBadge stage={p.stage} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                  <td className="px-4 py-3"><RagBadge rag={p.autoRag} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 w-28">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-accent-500 rounded-full" style={{ width: `${p.percentComplete}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{p.percentComplete}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    ${(p.budgetActual ?? 0).toLocaleString()} / ${(p.budgetPlanned ?? 0).toLocaleString()}
                  </td>
                </tr>
              ))}
              {inExecution.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Nothing in execution yet.
                  </td>
                </tr>
              )}
            </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
