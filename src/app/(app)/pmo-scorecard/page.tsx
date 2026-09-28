import Topbar from "@/components/Topbar";
import PmoScorecard from "@/components/PmoScorecard";

export const dynamic = "force-dynamic";

// Dedicated page for the org-wide PMO rollup (delivery success, resource utilization, CSAT
// trend) -- separate from /forecast since this is retrospective/governance ("how did we do,
// how strict are our gates") rather than forward-looking ("what's coming"). Same
// no-extra-access-gate pattern as /forecast: the panel's own API route enforces VIEWER and
// hides itself if forbidden, so this page just provides the shell.
export default function PmoScorecardPage() {
  return (
    <div>
      <Topbar title="PMO Scorecard" subtitle="Delivery success, resource utilization, and client satisfaction across every visible project" />
      <div className="p-8 space-y-6">
        <PmoScorecard />
      </div>
    </div>
  );
}
