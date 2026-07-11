import Link from "next/link";
import Topbar from "@/components/Topbar";
import { RagBadge, StageBadge, PriorityBadge } from "@/components/badges";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { getCurrentUser } from "@/lib/auth";
import { PlusCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  const projects = await getAllProjectsWithMetrics(user);

  const sorted = [...projects].sort((a, b) => {
    if (a.stage === "CLOSED" && b.stage !== "CLOSED") return 1;
    if (b.stage === "CLOSED" && a.stage !== "CLOSED") return -1;
    const order = { RED: 0, YELLOW: 1, GREEN: 2 } as Record<string, number>;
    return order[a.autoRag] - order[b.autoRag];
  });

  return (
    <div>
      <Topbar
        title="Projects"
        subtitle={`${projects.length} total projects`}
        action={
          <Link
            href="/projects/new"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <PlusCircle size={16} />
            New Project
          </Link>
        }
      />
      <div className="p-8">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2.5 font-medium">Project</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Country / Program</th>
                <th className="px-4 py-2.5 font-medium">Health</th>
                <th className="px-4 py-2.5 font-medium">% Complete</th>
                <th className="px-4 py-2.5 font-medium">Budget (Actual/Planned)</th>
                <th className="px-4 py-2.5 font-medium">Overdue Tasks</th>
                <th className="px-4 py-2.5 font-medium">PM</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><StageBadge stage={p.stage} /></td>
                  <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                  <td className="px-4 py-3 text-xs text-slate-500">{[p.country, p.program].filter(Boolean).join(" / ") || "—"}</td>
                  <td className="px-4 py-3"><RagBadge rag={p.autoRag} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 w-28">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${p.percentComplete}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{p.percentComplete}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    ${(p.budgetActual ?? 0).toLocaleString()} / ${(p.budgetPlanned ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={p.overdueTaskCount > 0 ? "text-rose-600 font-medium" : "text-slate-400"}>
                      {p.overdueTaskCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.projectManager ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
