import Link from "next/link";
import Topbar from "@/components/Topbar";
import { StageBadge, PriorityBadge } from "@/components/badges";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { PlusCircle, Lightbulb } from "lucide-react";

export const dynamic = "force-dynamic";

const IDEATION_STAGES = ["INCEPTION", "IDEATION", "CHARTER"];

export default async function IdeationPage() {
  const all = await getAllProjectsWithMetrics();
  const ideas = all
    .filter((p) => IDEATION_STAGES.includes(p.stage))
    .sort((a, b) => IDEATION_STAGES.indexOf(a.stage) - IDEATION_STAGES.indexOf(b.stage));

  return (
    <div>
      <Topbar
        title="Ideation"
        subtitle="Idea generation, feasibility, estimates, charter, and approval — before a project moves into execution"
        action={
          <Link
            href="/projects/new?intent=idea"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <PlusCircle size={16} />
            New Idea
          </Link>
        }
      />
      <div className="p-8 space-y-5">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 flex items-start gap-3">
          <Lightbulb size={18} className="text-indigo-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-indigo-900 mb-1">How ideation works</p>
            <p className="text-xs text-indigo-800 leading-relaxed">
              Every idea starts here — brainstorm and align on what to take forward, get an AI technical
              feasibility read, generate a cost/schedule estimate, build the project charter, then approve
              it. Once approved, it moves to Project Execution and you continue with the same record — nothing
              gets re-entered. Open any idea below to work through its steps (in the project&apos;s Charter tab).
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2.5 font-medium">Idea / Project</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Sponsor</th>
                <th className="px-4 py-2.5 font-medium">Estimated Budget</th>
              </tr>
            </thead>
            <tbody>
              {ideas.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><StageBadge stage={p.stage} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                  <td className="px-4 py-3 text-slate-600">{p.sponsor ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">${(p.budgetPlanned ?? 0).toLocaleString()}</td>
                </tr>
              ))}
              {ideas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No ideas in progress. Start one with &quot;New Idea&quot; above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
