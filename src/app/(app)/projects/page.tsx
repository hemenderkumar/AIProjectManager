import Link from "next/link";
import Topbar from "@/components/Topbar";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { attachDivisionInfo } from "@/lib/divisions";
import { getCurrentUser } from "@/lib/auth";
import { PlusCircle } from "lucide-react";
import ExportButtons from "@/components/ExportButtons";
import DownloadPdfLink from "@/components/DownloadPdfLink";
import ProjectsTableClient from "@/components/ProjectsTableClient";

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

  const { items: annotated, divisionOptions } = await attachDivisionInfo(sorted);

  return (
    <div>
      <Topbar
        title="Projects"
        subtitle={`${projects.length} total projects`}
        action={
          <div className="flex items-center gap-2">
            <DownloadPdfLink
              href="/api/deliverables/export-all"
              filename={`executa-deliverables-${new Date().toISOString().slice(0, 10)}.zip`}
              label="Export all deliverables (.zip)"
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            />
            <ExportButtons endpoint="/api/reports/projects" filenamePrefix="projects" />
            <Link
              href="/projects/new"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
            >
              <PlusCircle size={16} />
              New Project
            </Link>
          </div>
        }
      />
      <div className="p-8">
        <ProjectsTableClient projects={annotated} divisionOptions={divisionOptions} />
      </div>
    </div>
  );
}
