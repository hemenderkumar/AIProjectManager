import Link from "next/link";
import Topbar from "@/components/Topbar";
import { getAllProjectsWithMetrics } from "@/lib/portfolio";
import { attachDivisionInfo } from "@/lib/divisions";
import { getCurrentUser } from "@/lib/auth";
import { PlusCircle, Lightbulb } from "lucide-react";
import IdeaSuggestions from "@/components/IdeaSuggestions";
import ExportButtons from "@/components/ExportButtons";
import IdeationDashboardClient from "@/components/IdeationDashboardClient";

export const dynamic = "force-dynamic";

const IDEATION_STAGES = ["INCEPTION", "IDEATION", "CHARTER"];

export default async function IdeationPage() {
  const user = await getCurrentUser();
  const all = await getAllProjectsWithMetrics(user);
  const ideationProjects = all
    .filter((p) => IDEATION_STAGES.includes(p.stage))
    .sort((a, b) => IDEATION_STAGES.indexOf(a.stage) - IDEATION_STAGES.indexOf(b.stage));
  const { items: ideas, divisionOptions } = await attachDivisionInfo(ideationProjects);

  return (
    <div>
      <Topbar
        title="Ideation"
        subtitle="Idea generation, feasibility, estimates, charter, and approval — before a project moves into execution"
        action={
          <div className="flex items-center gap-2">
            <ExportButtons endpoint="/api/reports/ideation" filenamePrefix="ideation" />
            <Link
              href="/projects/new?intent=idea"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-accent-600 text-white shadow-sm shadow-accent-600/20 transition-colors hover:bg-accent-700"
            >
              <PlusCircle size={16} />
              New Idea
            </Link>
          </div>
        }
      />
      <div className="p-8 space-y-5">
        <IdeationDashboardClient ideas={ideas} divisionOptions={divisionOptions} />

        <div className="rounded-xl border border-accent-100 bg-accent-50/60 px-5 py-4 flex items-start gap-3">
          <Lightbulb size={18} className="text-accent-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-accent-900 mb-1">How ideation works</p>
            <p className="text-xs text-accent-800 leading-relaxed">
              Every idea starts here — brainstorm and align on what to take forward, get an AI technical
              feasibility read, generate a cost/schedule estimate, build the project charter, then approve
              it. Once approved, it moves to Project Execution and you continue with the same record — nothing
              gets re-entered. Open any idea below to work through its steps (in the project&apos;s Charter tab).
            </p>
          </div>
        </div>

        <IdeaSuggestions />
      </div>
    </div>
  );
}
