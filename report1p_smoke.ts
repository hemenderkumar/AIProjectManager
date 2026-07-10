import { generateReportOnePagerPdf, generateReportOnePagerPptx } from "./src/lib/reportExport";

const input = {
  projectName: "Salesforce AI Agent Platform",
  reportText: `## Executive Summary
The project is progressing on schedule with moderate budget variance.

## Portfolio Health
Green overall, one open risk.

## Key Risks & Blockers
Vendor delay on API access.

## Budget Snapshot
$120,000 spent of $150,000 planned.

## Recommended Actions
Approve additional contractor hours to keep pace with testing phase.`,
  chartData: {
    budget: { planned: 150000, actual: 120000 },
    schedule: { plannedPercent: 60, actualPercent: 55 },
    effort: { plannedHours: 800, actualHours: 750 },
  },
  generatedAt: new Date(),
};

async function main() {
  const pdf = await generateReportOnePagerPdf(input);
  console.log("1-pager PDF bytes:", pdf.length);
  const pptx = await generateReportOnePagerPptx(input);
  console.log("1-pager PPTX bytes:", pptx.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
