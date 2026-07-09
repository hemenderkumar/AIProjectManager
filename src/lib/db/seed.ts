import "dotenv/config";
import { db } from "./index";
import { hashPassword } from "../auth";
import {
  projects,
  resources,
  projectResources,
  tasks,
  statusUpdates,
  communicationLogs,
  riskItems,
  milestones,
  users,
  settings,
} from "./schema";

async function main() {
  console.log("Seeding database...");

  const today = new Date();
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86400000);
  const daysFromNow = (n: number) => new Date(today.getTime() + n * 86400000);

  const [alice, bob, carol, dave, erin] = await db
    .insert(resources)
    .values([
      { name: "Alice Chen", role: "Engineering Lead", email: "alice@example.com", capacityHoursPerWk: 40, costPerHour: 95 },
      { name: "Bob Martinez", role: "Product Manager", email: "bob@example.com", capacityHoursPerWk: 40, costPerHour: 85 },
      { name: "Carol Singh", role: "Designer", email: "carol@example.com", capacityHoursPerWk: 32, costPerHour: 75 },
      { name: "Dave Okafor", role: "Data Engineer", email: "dave@example.com", capacityHoursPerWk: 40, costPerHour: 90 },
      { name: "Erin Walsh", role: "QA Lead", email: "erin@example.com", capacityHoursPerWk: 40, costPerHour: 70 },
    ])
    .returning();

  await db
    .insert(resources)
    .values({ name: "AI PM", role: "AI Project Manager", email: "ai-pm@example.com", capacityHoursPerWk: 168, costPerHour: 0 });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

  await db.insert(users).values([
    { name: "Admin", email: adminEmail.toLowerCase(), passwordHash: await hashPassword(adminPassword), role: "ADMIN" },
    { name: "Bob Martinez", email: "bob@example.com", passwordHash: await hashPassword("changeme123"), role: "PM", resourceId: bob.id },
    { name: "Alice Chen", email: "alice@example.com", passwordHash: await hashPassword("changeme123"), role: "CONTRIBUTOR", resourceId: alice.id },
  ]);

  await db.insert(settings).values({ id: "default" }).onConflictDoNothing();

  // Project 1: Execution stage, healthy
  const [p1] = await db
    .insert(projects)
    .values({
      name: "Customer Portal Revamp",
      description: "Redesign and rebuild the customer self-service portal.",
      sponsor: "VP of Customer Experience",
      projectManager: "Bob Martinez",
      stage: "EXECUTION",
      priority: "HIGH",
      ragStatus: "GREEN",
      startDate: daysAgo(60),
      targetEndDate: daysFromNow(45),
      budgetPlanned: 250000,
      budgetActual: 132000,
      percentComplete: 55,
      problemStatement: "Customers struggle with an outdated portal causing high support ticket volume.",
      proposedSolution: "Rebuild the portal with modern UX, self-service billing, and live chat.",
      expectedBenefits: "30% reduction in support tickets, higher NPS, faster onboarding.",
      businessCase: "Support cost savings of ~$400k/year and improved retention.",
      objectives: "Launch new portal by Q4; reduce ticket volume by 30%; NPS +10 points.",
      scopeInScope: "Account management, billing, support center, live chat.",
      scopeOutOfScope: "Mobile native app (phase 2).",
      deliverables: "New portal, migration plan, support runbook.",
      successCriteria: "30% ticket reduction, <2s page load, 99.9% uptime.",
      stakeholders: "CX VP, Support Director, Eng Lead, Design Lead.",
      assumptionsRisks: "Assumes legacy API stability; risk of data migration delays.",
      charterApprovedBy: "VP of Customer Experience",
      charterApprovedAt: daysAgo(55),
    })
    .returning();

  // Project 2: Charter stage, at risk
  const [p2] = await db
    .insert(projects)
    .values({
      name: "Data Warehouse Migration",
      description: "Migrate legacy data warehouse to a modern cloud data platform.",
      sponsor: "CTO",
      projectManager: "Dave Okafor",
      stage: "CHARTER",
      priority: "CRITICAL",
      ragStatus: "YELLOW",
      startDate: daysAgo(20),
      targetEndDate: daysFromNow(150),
      budgetPlanned: 500000,
      budgetActual: 60000,
      percentComplete: 8,
      problemStatement: "Legacy warehouse cannot scale and has frequent outages.",
      proposedSolution: "Migrate to a modern lakehouse architecture with automated pipelines.",
      expectedBenefits: "50% lower infra cost, real-time analytics capability.",
      businessCase: "Reduces infra spend by $600k/yr and unblocks real-time reporting.",
      objectives: "Zero-downtime migration; decommission legacy system within 6 months.",
      scopeInScope: "All production data pipelines and BI reporting layer.",
      scopeOutOfScope: "Historical archive older than 7 years.",
      deliverables: "Migration runbook, new pipeline architecture, cutover plan.",
      successCriteria: "100% pipeline parity, <0.1% data discrepancy.",
      stakeholders: "CTO, Data team, BI analysts, Finance.",
      assumptionsRisks: "Vendor contract timing risk; key engineer availability risk.",
    })
    .returning();

  // Project 3: Ideation stage
  const [p3] = await db
    .insert(projects)
    .values({
      name: "AI-Assisted Support Triage",
      description: "Explore using AI to auto-triage and route inbound support tickets.",
      sponsor: "Head of Support",
      projectManager: "Bob Martinez",
      stage: "IDEATION",
      priority: "MEDIUM",
      ragStatus: "GREEN",
      percentComplete: 5,
      problemStatement: "Manual triage adds ~4 hours/day of delay to ticket routing.",
      proposedSolution: "Use an LLM classifier to auto-tag and route tickets by topic/urgency.",
      expectedBenefits: "Faster first-response time, reduced triage labor.",
      ideationNotes: "Early spike shows 85% classification accuracy on historical tickets. Needs a charter and budget sign-off before moving forward.",
    })
    .returning();

  // Project 4: Inception stage
  const [p4] = await db
    .insert(projects)
    .values({
      name: "Vendor Contract Consolidation",
      description: "Consolidate overlapping SaaS vendor contracts to cut cost.",
      sponsor: "CFO",
      projectManager: "Carol Singh",
      stage: "INCEPTION",
      priority: "LOW",
      ragStatus: "GREEN",
      percentComplete: 0,
    })
    .returning();

  // Project 5: Execution, at risk / red (overdue + over budget)
  const [p5] = await db
    .insert(projects)
    .values({
      name: "Mobile App 2.0 Launch",
      description: "Full rewrite of the mobile app on a shared cross-platform codebase.",
      sponsor: "VP Product",
      projectManager: "Alice Chen",
      stage: "EXECUTION",
      priority: "CRITICAL",
      ragStatus: "RED",
      startDate: daysAgo(120),
      targetEndDate: daysAgo(10),
      budgetPlanned: 400000,
      budgetActual: 470000,
      percentComplete: 68,
      businessCase: "Unifies iOS/Android codebase, cutting maintenance cost 40%.",
      objectives: "Ship v2.0 to both app stores with feature parity plus offline mode.",
      scopeInScope: "Core app rewrite, offline mode, push notifications.",
      scopeOutOfScope: "Tablet-optimized layouts (phase 2).",
      deliverables: "Shipped app v2.0, migration guide, updated CI/CD.",
      successCriteria: "Crash-free rate >99.5%, app store rating >4.5.",
      stakeholders: "VP Product, Mobile team, App Store review team.",
      assumptionsRisks: "Cross-platform framework maturity risk; app store review delays.",
      charterApprovedBy: "VP Product",
      charterApprovedAt: daysAgo(115),
    })
    .returning();

  // Project 6: Closed
  const [p6] = await db
    .insert(projects)
    .values({
      name: "Employee Onboarding Portal",
      description: "New hire onboarding self-service site.",
      sponsor: "VP People",
      projectManager: "Carol Singh",
      stage: "CLOSED",
      priority: "MEDIUM",
      ragStatus: "GREEN",
      startDate: daysAgo(200),
      targetEndDate: daysAgo(30),
      actualEndDate: daysAgo(28),
      budgetPlanned: 90000,
      budgetActual: 87500,
      percentComplete: 100,
    })
    .returning();

  const allProjects = [p1, p2, p3, p4, p5, p6];

  // Resource allocations
  await db.insert(projectResources).values([
    { projectId: p1.id, resourceId: bob.id, allocationPercent: 60 },
    { projectId: p1.id, resourceId: alice.id, allocationPercent: 40 },
    { projectId: p1.id, resourceId: carol.id, allocationPercent: 50 },
    { projectId: p2.id, resourceId: dave.id, allocationPercent: 80 },
    { projectId: p2.id, resourceId: alice.id, allocationPercent: 20 },
    { projectId: p3.id, resourceId: bob.id, allocationPercent: 20 },
    { projectId: p5.id, resourceId: alice.id, allocationPercent: 60 },
    { projectId: p5.id, resourceId: erin.id, allocationPercent: 50 },
    { projectId: p5.id, resourceId: carol.id, allocationPercent: 30 },
    { projectId: p6.id, resourceId: carol.id, allocationPercent: 10 },
  ]);

  // Tasks
  await db.insert(tasks).values([
    { projectId: p1.id, title: "Finalize billing UI designs", status: "DONE", priority: "HIGH", assigneeId: carol.id, dueDate: daysAgo(10), completedAt: daysAgo(12), estimateHours: 40, actualHours: 38 },
    { projectId: p1.id, title: "Build account management API", status: "IN_PROGRESS", priority: "HIGH", assigneeId: alice.id, dueDate: daysFromNow(7), estimateHours: 60, actualHours: 30 },
    { projectId: p1.id, title: "Integrate live chat widget", status: "TODO", priority: "MEDIUM", assigneeId: bob.id, dueDate: daysFromNow(20), estimateHours: 25 },
    { projectId: p1.id, title: "Migrate legacy billing records", status: "BLOCKED", priority: "CRITICAL", assigneeId: dave.id, dueDate: daysAgo(2), estimateHours: 30, actualHours: 15 },

    { projectId: p2.id, title: "Draft data platform architecture", status: "IN_PROGRESS", priority: "CRITICAL", assigneeId: dave.id, dueDate: daysFromNow(5), estimateHours: 50, actualHours: 20 },
    { projectId: p2.id, title: "Vendor selection & procurement", status: "TODO", priority: "HIGH", assigneeId: dave.id, dueDate: daysFromNow(15), estimateHours: 20 },

    { projectId: p3.id, title: "Run classifier accuracy spike", status: "DONE", priority: "MEDIUM", assigneeId: dave.id, dueDate: daysAgo(5), completedAt: daysAgo(6), estimateHours: 16, actualHours: 14 },
    { projectId: p3.id, title: "Draft ideation brief for sponsor review", status: "IN_PROGRESS", priority: "MEDIUM", assigneeId: bob.id, dueDate: daysFromNow(3), estimateHours: 8 },

    { projectId: p5.id, title: "Fix offline sync crash on Android", status: "BLOCKED", priority: "CRITICAL", assigneeId: alice.id, dueDate: daysAgo(15), estimateHours: 20, actualHours: 25 },
    { projectId: p5.id, title: "App Store review resubmission", status: "TODO", priority: "CRITICAL", assigneeId: alice.id, dueDate: daysAgo(3), estimateHours: 10 },
    { projectId: p5.id, title: "Regression test suite pass", status: "IN_PROGRESS", priority: "HIGH", assigneeId: erin.id, dueDate: daysAgo(1), estimateHours: 30, actualHours: 22 },
    { projectId: p5.id, title: "Push notification service cutover", status: "BLOCKED", priority: "HIGH", assigneeId: alice.id, dueDate: daysAgo(8), estimateHours: 15 },
    { projectId: p5.id, title: "App store marketing assets", status: "DONE", priority: "LOW", assigneeId: carol.id, dueDate: daysAgo(20), completedAt: daysAgo(22), estimateHours: 12, actualHours: 12 },
  ]);

  // Status updates
  await db.insert(statusUpdates).values([
    { projectId: p1.id, date: daysAgo(7), ragStatus: "GREEN", percentComplete: 50, summary: "On track. Billing UI complete, API work underway.", accomplishments: "Billing UI finalized and reviewed.", upcoming: "Start account API integration.", blockers: "None." },
    { projectId: p1.id, date: daysAgo(1), ragStatus: "GREEN", percentComplete: 55, summary: "Steady progress, minor scope clarification needed on chat widget.", accomplishments: "Account API 50% complete.", upcoming: "Legacy billing migration.", blockers: "Waiting on legacy DB access." },
    { projectId: p2.id, date: daysAgo(3), ragStatus: "YELLOW", percentComplete: 8, summary: "Charter in review; vendor selection taking longer than planned.", accomplishments: "Draft architecture circulated.", upcoming: "Finalize vendor shortlist.", blockers: "Procurement approval pending." },
    { projectId: p5.id, date: daysAgo(2), ragStatus: "RED", percentComplete: 68, summary: "Launch delayed past target date due to Android crash and App Store rejection.", accomplishments: "Regression pass 80% done.", upcoming: "Resubmit to App Store.", blockers: "Offline sync crash unresolved; budget over by 17%." },
  ]);

  // Communications
  await db.insert(communicationLogs).values([
    { projectId: p1.id, date: daysAgo(7), type: "MEETING", summary: "Sprint review with CX stakeholders.", participants: "Bob, Alice, Carol, CX VP", actionItems: "Confirm billing edge cases by Friday." },
    { projectId: p2.id, date: daysAgo(3), type: "EMAIL", summary: "Vendor procurement status update sent to CTO.", participants: "Dave, CTO", actionItems: "CTO to approve budget extension." },
    { projectId: p5.id, date: daysAgo(2), type: "CALL", summary: "Escalation call on launch delay with VP Product.", participants: "Alice, Erin, VP Product", actionItems: "Daily standup until crash resolved; revised launch date by EOW." },
  ]);

  // Risks
  await db.insert(riskItems).values([
    { projectId: p1.id, description: "Legacy billing data may have inconsistent formats.", impact: "MEDIUM", likelihood: "MEDIUM", mitigation: "Run validation scripts before cutover.", owner: "Dave Okafor", status: "MITIGATING" },
    { projectId: p2.id, description: "Vendor contract negotiation could delay migration start.", impact: "HIGH", likelihood: "MEDIUM", mitigation: "Parallel-track two vendor finalists.", owner: "Dave Okafor", status: "OPEN" },
    { projectId: p5.id, description: "Cross-platform offline sync bug blocking release.", impact: "CRITICAL", likelihood: "HIGH", mitigation: "Dedicated task force, daily triage.", owner: "Alice Chen", status: "OPEN" },
    { projectId: p5.id, description: "App Store review rejection risk on resubmission.", impact: "HIGH", likelihood: "MEDIUM", mitigation: "Pre-review with Apple TestFlight beta group.", owner: "Alice Chen", status: "OPEN" },
  ]);

  // Milestones
  await db.insert(milestones).values([
    { projectId: p1.id, name: "Design sign-off", dueDate: daysAgo(15), completedAt: daysAgo(16), status: "DONE" },
    { projectId: p1.id, name: "Beta launch", dueDate: daysFromNow(20), status: "TODO" },
    { projectId: p1.id, name: "GA launch", dueDate: daysFromNow(45), status: "TODO" },
    { projectId: p2.id, name: "Charter approval", dueDate: daysFromNow(10), status: "IN_PROGRESS" },
    { projectId: p2.id, name: "Vendor selected", dueDate: daysFromNow(25), status: "TODO" },
    { projectId: p5.id, name: "Code freeze", dueDate: daysAgo(30), completedAt: daysAgo(29), status: "DONE" },
    { projectId: p5.id, name: "App Store submission", dueDate: daysAgo(10), status: "BLOCKED" },
    { projectId: p6.id, name: "Go-live", dueDate: daysAgo(30), completedAt: daysAgo(28), status: "DONE" },
  ]);

  console.log(`Seeded ${allProjects.length} projects and related records.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
