import Topbar from "@/components/Topbar";
import AiAskPanel from "@/components/AiAskPanel";
import PortfolioReportPanel from "@/components/PortfolioReportPanel";

export default function AiPage() {
  return (
    <div>
      <Topbar title="AI Assistant" subtitle="Ask questions or generate reports across the whole portfolio" />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AiAskPanel />
        <PortfolioReportPanel />
      </div>
    </div>
  );
}
