import { generatePortfolioOnePagerPdf, generatePortfolioOnePagerPptx } from "./src/lib/portfolioExport";
import type { PortfolioOnePager } from "./src/lib/portfolioReportData";

const data: PortfolioOnePager = {
  activeCount: 5,
  byRag: { GREEN: 2, YELLOW: 2, RED: 1 },
  avgPercentComplete: 42,
  totalBudgetPlanned: 500000,
  totalBudgetActual: 275000,
  totalOverdueTasks: 3,
  totalOpenHighRisks: 1,
  topAtRisk: [
    { name: "Salesforce AI Agent", stage: "EXECUTION", rag: "RED", reason: "Overdue tasks" },
    { name: "Data Migration", stage: "CHARTER", rag: "YELLOW", reason: "Budget variance" },
  ],
};

async function main() {
  const pdf = await generatePortfolioOnePagerPdf(data, new Date());
  console.log("PDF bytes:", pdf.length);
  const pptx = await generatePortfolioOnePagerPptx(data, new Date());
  console.log("PPTX bytes:", pptx.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
