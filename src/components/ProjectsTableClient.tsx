"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { RagBadge, StageBadge, PriorityBadge } from "@/components/badges";
import DivisionFilterSelect from "@/components/DivisionFilterSelect";

type Project = {
  id: string;
  name: string;
  stage: string;
  priority: string;
  country: string | null;
  stateProvince: string | null;
  program: string | null;
  autoRag: string;
  percentComplete: number;
  budgetActual: number | null;
  budgetPlanned: number | null;
  overdueTaskCount: number;
  projectManager: string | null;
  divisionId: string | null;
  divisionName: string | null;
};

// Division-filterable project table, extracted out of page.tsx so picking a division doesn't
// need a full page round-trip. The server page does the fetch + division-resolution
// (attachDivisionInfo) and the RAG/CLOSED-last sort, then hands the annotated+sorted list down.
export default function ProjectsTableClient({ projects, divisionOptions }: { projects: Project[]; divisionOptions: { id: string; name: string }[] }) {
  const [division, setDivision] = useState("ALL");

  const filtered = useMemo(
    () => (division === "ALL" ? projects : projects.filter((p) => p.divisionId === division)),
    [projects, division]
  );

  return (
    <>
      {divisionOptions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-3 flex items-center gap-2 mb-4">
          <span className="text-xs text-slate-500">Division:</span>
          <DivisionFilterSelect value={division} onChange={setDivision} divisions={divisionOptions} />
          {division !== "ALL" && (
            <button onClick={() => setDivision("ALL")} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>
          )}
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} of {projects.length} projects</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-2.5 font-medium">Project</th>
              <th className="px-4 py-2.5 font-medium">Stage</th>
              <th className="px-4 py-2.5 font-medium">Priority</th>
              <th className="px-4 py-2.5 font-medium">Country / Program</th>
              <th className="px-4 py-2.5 font-medium">Division</th>
              <th className="px-4 py-2.5 font-medium">Health</th>
              <th className="px-4 py-2.5 font-medium">% Complete</th>
              <th className="px-4 py-2.5 font-medium">Budget (Actual/Planned)</th>
              <th className="px-4 py-2.5 font-medium">Overdue Tasks</th>
              <th className="px-4 py-2.5 font-medium">PM</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-accent-600">
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3"><StageBadge stage={p.stage} /></td>
                <td className="px-4 py-3"><PriorityBadge priority={p.priority} /></td>
                <td className="px-4 py-3 text-xs text-slate-500">{[p.country, p.stateProvince, p.program].filter(Boolean).join(" / ") || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{p.divisionName ?? "—"}</td>
                <td className="px-4 py-3"><RagBadge rag={p.autoRag} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 w-28">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent-500 rounded-full"
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  No projects match this division.
                </td>
              </tr>
            )}
          </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
