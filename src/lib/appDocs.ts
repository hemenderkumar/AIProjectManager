// Static content for the three whole-app reference documents generated under
// Admin > Documentation (Requirements Specification, Design Document, Training Manual).
// Unlike every other docx export in this codebase, these describe Keel itself rather than
// a row in the database, so there's no organization/project to load — the content lives
// here as plain data and is rendered through the same buildSectionedDocx formal template
// (cover page, TOC, revision history, running header/footer) used everywhere else.
//
// Keep this in sync by hand when a feature is added or changed materially — there is no
// automated way to derive "what Keel does" from the codebase, so this is the source of
// truth for what these three documents say.

export type DocSection = { heading: string; body: string };

export const APP_DOC_VERSION = "1.0";
export const APP_DOC_DATE = new Date("2026-07-18");

// ---------------------------------------------------------------------------
// Requirements Specification
// ---------------------------------------------------------------------------
export const REQUIREMENTS_SECTIONS: DocSection[] = [
  {
    heading: "1. Purpose & Scope",
    body:
      "Keel is a single system of record for running client and internal projects end to end — from an early idea, through a costed and staffed delivery plan, through execution, to a signed-off deliverable and ongoing support. It replaces the usual patchwork of spreadsheets for budgets, chat threads for status, generic task boards with no project context, and hand-built decks for steering committees.\n" +
      "This document describes what Keel does today, organized by module. It is a living reference, not a contractual specification — update it when a feature changes materially.",
  },
  {
    heading: "2. User Roles & Access Model",
    body:
      "Keel has five roles, each a strict superset of the one below it in day-to-day capability:\n" +
      "- ADMIN — full platform access. Manages users, companies (organizations), roles, automation settings, the audit log, user activity, and reported issues. The only role that can see across every organization.\n" +
      "- SUPER_USER — a client company's own account owner. Manages their organization's users (PM/CONTRIBUTOR/VIEWER), divisions, stakeholders, and rate cards. Sees only their own organization's projects.\n" +
      "- PM — creates and runs projects, drafts charters/plans/SOWs/deliverables, manages tasks and risks. Sees only projects they are an explicit member of (or all of them, if internal staff with no organization).\n" +
      "- CONTRIBUTOR — works within assigned projects: updates tasks, logs communications, reports issues.\n" +
      "- VIEWER — read-only access to projects they are a member of.\n" +
      "A user with no organization (organizationId = null) is \"internal staff\" — Keel's own team — and can see cross-portfolio surfaces (Resources, Rate Cards, Reports) that a client-side user cannot.",
  },
  {
    heading: "3. Ideation",
    body:
      "Every project can start as an idea before it becomes a committed initiative. Ideation captures: idea type (Opportunity or Problem), a brainstorming log (AI-assisted or manual entries), solution options with pros/cons/feasibility notes and an \"is selected\" flag, a feasibility score and notes, and a status progression (Exploring -> Comparing Options -> Ready for Charter). An AI-generated technical recommendation and a lightweight EA (enterprise architecture) review step can be attached before an idea is promoted into a full project charter.",
  },
  {
    heading: "4. Project Charter",
    body:
      "The charter is the formal definition of a committed project: sponsor and stakeholders, high-level requirements, architecture and integrated systems, options considered, total funding required, contingency percentage, ongoing support cost/plan, ROI expected, and internal support needs. Charters can be AI-drafted from the ideation content, edited by hand, or edited via the AI chat (propose-then-apply). A charter (and each project stage) requires explicit approval, recorded with an approver and timestamp.",
  },
  {
    heading: "5. Planning & Execution",
    body:
      "Projects choose an execution methodology: Waterfall, Scrum, or Hybrid. Tasks carry a phase, required skills and experience level, an execution source (AI / Internal / Vendor), and — for Scrum/Hybrid — a sprint and story points. An AI planner can generate a full task breakdown from the charter, estimate effort, and auto-assign tasks to resources by matching required skills/experience. The Sprint Board provides a kanban view, velocity, and burndown for sprint-based projects.",
  },
  {
    heading: "6. Resources & Rate Cards",
    body:
      "Resources (people) carry skills, years of experience, and a sourcing type (Onsite / Offshore / Contractor). Rate cards define an hourly rate per role and sourcing type, scoped either globally (internal staff) or per client organization (SUPER_USER-managed). A resource's effective rate can be overridden individually. Rates feed directly into cost estimation and the delivery/pricing recommendation.",
  },
  {
    heading: "7. Delivery & Pricing",
    body:
      "For each project, Keel can recommend a delivery role mix (which roles, how many hours, and the onsite/offshore/contractor split) and a pricing model (Fixed Bid or Time & Materials), with an AI-generated rationale. Cost estimation combines role-mix hours x rate cards, a configurable contingency percentage, one-off material costs, and recurring ongoing-support costs into a full project budget.",
  },
  {
    heading: "8. Risk Management",
    body:
      "Risks are tracked per project with a status lifecycle, and can be AI-drafted from a short description via \"Draft with AI,\" then edited further through the AI chat. Every risk is visible on the project's Risks tab and rolls up into status reports.",
  },
  {
    heading: "9. Communications Log",
    body:
      "A running log of stakeholder communications per project (type, summary, date), AI-draftable the same way risks are, used as supporting evidence for status reports and steering packs.",
  },
  {
    heading: "10. Milestones",
    body:
      "Key dates per project, optionally linked to a specific SOW, used to track delivery against the contracted plan.",
  },
  {
    heading: "11. Status Reporting & Steering Packs",
    body:
      "A weekly (or biweekly/monthly/manual) status report and a steering-committee pack are available per project and portfolio-wide, each exportable as a branded PDF or PowerPoint, including a Planned-vs-Actual KPI chart. Cadence is configurable in Admin > Automation Settings and can run on a schedule (Vercel Cron).",
  },
  {
    heading: "12. Statements of Work (SOW)",
    body:
      "A SOW captures vendor name/contact, scope, deliverables summary, timeline, funding amount and terms, risks, and issues, with a status lifecycle (Draft -> Approved -> Pending Signature -> Signed -> Active -> Completed/Terminated). SOWs can be AI-drafted, exported as a formal Word document, internally approved, and have a signed copy uploaded once countersigned. A SOW can originate directly from an awarded RFP vendor response.",
  },
  {
    heading: "13. Deliverables & Test Management",
    body:
      "Deliverables have a type (Requirements/NFR, Detailed Design, Functional Test Script, UAT Script, Release Documentation, Other) and a status (Draft -> In Review -> Approved -> Final). Detailed Design deliverables can include an AI-generated architecture diagram (rendered client-side, embedded in the Word export). Test-script deliverables hold a structured table of test cases (scenario, steps, expected/actual result, status, executed by). Deliverables trace back to the tasks that produced them, and release readiness can be assessed from aggregate test results. Every deliverable exports as a formal Word document, individually or in one click for the whole portfolio (Admin/PM export-all).",
  },
  {
    heading: "14. Vendor Evaluation (RFP) & Vendor Scorecard",
    body:
      "A SUPER_USER can build an RFP — auto-drafted from a project's charter, or from a few typed pointers if no project/charter exists yet — define weighted evaluation criteria, and invite vendors by email to a no-login, tokenized response link. Vendor responses are AI-scored against the weighted rubric, compared side by side, and a recommendation is generated. A separate Vendor Scorecard aggregates a vendor's track record across every project they have delivered on.",
  },
  {
    heading: "15. Ongoing Support",
    body:
      "A portfolio-wide incident/ticket board (Open -> In Progress -> Resolved -> Closed), each incident optionally linked to a project, with severity, assignee, resolution notes, and an AI recommendation. A support cost estimator projects the ongoing monthly support cost from the same rate cards used elsewhere.",
  },
  {
    heading: "16. Portfolio Reporting & Dashboards",
    body:
      "A portfolio-wide dashboard and project list show RAG health (auto-computed from schedule/budget/risk signals), percent complete, budget actual vs. planned, overdue task counts, and cross-project pattern learning (surfacing recurring risks/issues across similar past projects). Country/state-province and program tagging allow rollups by geography or program.",
  },
  {
    heading: "17. AI Capabilities",
    body:
      "AI is woven through the product rather than bolted on as a side panel: an AI project-manager avatar available on every page (portfolio-wide or project-scoped depending on context) that can brief the user, answer natural-language questions about a project, and jump to common actions; \"Draft with AI\" on risks, tasks, communications, and solution options; a generic propose-then-review-diff-then-apply AI edit chat available on Charter, SOW, Deliverables, Risks, Tasks, and Solution Options; and AI-generated recommendations for planning, technical approach, delivery/pricing, and vendor scoring. All AI calls are server-side only (the API key is never exposed to the browser).",
  },
  {
    heading: "18. Document Export",
    body:
      "Every major artifact (charter, SOW, deliverables, status reports, steering packs, the executive dashboard, and the whole-portfolio deliverable set) can be exported as a formally branded document: Word (.docx) with a cover page, real Word table-of-contents field, revision history, and running header/footer; PDF; or PowerPoint, depending on the artifact. A document is branded with the client organization's name when the project belongs to one, or with Keel's own branding for internal-only projects.",
  },
  {
    heading: "19. Multi-Tenancy & Organizations",
    body:
      "An organization is a client company. A project with an organizationId belongs to that company and every export/branding decision follows from that; a project with no organizationId is internal-only. A SUPER_USER can only ever see and manage their own organization's data. An ADMIN can create new organizations together with their first owner (SUPER_USER) account in one step, export an organization's full data (self-service data export), and process an organization-deletion request.",
  },
  {
    heading: "20. Issue Reporting & Admin Event Log",
    body:
      "Any logged-in user can report a bug or piece of feedback from anywhere in the app via a floating button, which automatically attaches a screenshot of the page they were on (captured client-side in the browser, no OS-level permission prompt). Admins triage every report in a dedicated event log (Admin > Issue Reports), with a status lifecycle (Open -> In Progress -> Resolved / Won't Fix) and a full-size screenshot viewer.",
  },
  {
    heading: "21. Theming & Personalization",
    body:
      "Six selectable color themes (Indigo, Nautical, Ocean, Chart, Compass, Coral) can be switched instantly from the sidebar, persist per browser, and apply with no flash-of-unstyled-content on reload. Every chart, badge, and accent color in the product follows the active theme.",
  },
  {
    heading: "22. Security, Privacy & Data Handling",
    body:
      "Authentication is session-cookie + JWT based, with self-service and admin-initiated password reset, and admin-issued setup links (an admin never sees or sets a user's actual password). New users can self-register (individual or company owner) and require admin approval before they can log in. An audit log records every sensitive action (approvals, rate changes, role changes, deletions) with actor, action, entity, and detail. A separate lightweight activity log records logins and public-link visits for usage insight. Organizations can request self-service data export and deletion. Privacy Policy and Terms of Service pages are published and linked from every page's footer.",
  },
  {
    heading: "23. Mobile & Installability",
    body:
      "The application shell is fully responsive: on phone-sized screens the sidebar becomes an off-canvas drawer opened via a hamburger button, with base font sizes bumped for legibility. Keel can also be installed to a phone's home screen (Android and iOS) via a web app manifest and a minimal service worker, opening full-screen without a browser address bar, with no app-store listing required.",
  },
  {
    heading: "24. Non-Functional Requirements",
    body:
      "- Every page and API route enforces role- and organization-scoped access; no cross-tenant data leakage.\n" +
      "- AI features degrade gracefully (a failed AI call never blocks the underlying manual workflow).\n" +
      "- Exports (Word/PDF/PPTX) must render correctly in both Microsoft Word/PowerPoint and common viewers.\n" +
      "- The mobile shell must remain usable down to a standard phone viewport width.\n" +
      "- No sensitive credential (password, API key) is ever exposed to the browser or logged in plain text.",
  },
];

// ---------------------------------------------------------------------------
// Design Document
// ---------------------------------------------------------------------------
export const DESIGN_SECTIONS: DocSection[] = [
  {
    heading: "1. Overview & Goals",
    body:
      "Keel is a Next.js (App Router) application backed by a single Postgres database via Drizzle ORM, deployed on Vercel. The guiding design principle across this build has been: every artifact a delivery team already produces by hand (a charter, a status deck, a SOW, a test script) should be a first-class, structured record in the system — not a document that happens to get attached to it — so it can be AI-drafted, AI-edited, reported on, and exported consistently.",
  },
  {
    heading: "2. Technology Stack",
    body:
      "- Framework: Next.js 16 (App Router), React 19, TypeScript.\n" +
      "- Styling: Tailwind CSS v4, using a CSS custom-property indirection layer (--accent-*) so the whole product can re-theme at runtime by swapping one set of variables per [data-theme] attribute, reusing Tailwind's own built-in oklch color ramps.\n" +
      "- Database: Postgres, accessed through Drizzle ORM (postgres-js driver). Schema lives in one file (src/lib/db/schema.ts).\n" +
      "- AI: Anthropic Claude via @anthropic-ai/sdk, called only from server-side API routes.\n" +
      "- Document generation: docx (Word), pptxgenjs (PowerPoint), pdfkit (PDF), mermaid (client-rendered diagrams), jszip (batch export archives).\n" +
      "- Auth: jose (JWT) + bcryptjs, session carried in an HTTP-only cookie.\n" +
      "- Deployment: Vercel, with Vercel Cron driving scheduled report generation.",
  },
  {
    heading: "3. Application Architecture",
    body:
      "Routes are split into an (app) route group (the authenticated shell — sidebar, topbar, every project/portfolio page) and standalone public routes (marketing homepage, login, register, password reset, public RFP/status-request links). AppShell.tsx is the single client-side wrapper mounted around every authenticated page; it owns the mobile drawer state and mounts the two always-available floating widgets (AvatarAssistant, IssueReporter). Server Components fetch data directly via Drizzle where possible; interactive pieces (forms, tabs, the AI chat panels) are Client Components that call the app's own API routes.",
  },
  {
    heading: "4. Data Model & Schema Overview",
    body:
      "Everything lives in one Drizzle schema file. Major table groups: projects (the central record, ~60+ columns spanning ideation through delivery/pricing/technical review), tasks/sprints, resources/rateCards/projectResources/deliveryRoleMix, riskItems/communicationLogs/milestones, statusUpdates/reports, sows/deliverables/deliverableTestCases, rfps/rfpCriteria/rfpVendors/rfpVendorScores/rfpRecommendations, organizations/divisions/stakeholders/users/projectMembers, costItems/invoices/timeEntries, incidents (ongoing support), brainstormEntries/solutionOptions (ideation), auditLog/activityEvents/issueReports (observability), settings (automation cadences), and registrationRequests/passwordResetTokens (account lifecycle). Foreign keys use ON DELETE SET NULL for \"soft\" references (e.g. an actor/reporter row) and ON DELETE CASCADE for true parent-child data (e.g. a project's tasks).",
  },
  {
    heading: "5. Multi-Tenancy Design",
    body:
      "There is no separate \"company\" entity distinct from organizations — organizations IS both the client-company record and the multi-tenant scoping root. projects.organizationId (nullable) is the single branding and visibility signal: null means internal-only (Keel-branded, visible to any internal staff PM), set means it belongs to that client (branded with their name, visible only to that organization's SUPER_USER/PM/CONTRIBUTOR/VIEWER members). src/lib/tenancy.ts centralizes the scoping rule (filterProjectsForUser, requireProjectAccess) so every list/detail page and API route enforces the same rule from one place rather than re-deriving it.",
  },
  {
    heading: "6. Authentication & Authorization",
    body:
      "getCurrentUser() reads and verifies the session JWT from an HTTP-only cookie; requireRole(minRole) additionally checks the caller's role against a five-level hierarchy (ADMIN > SUPER_USER > PM > CONTRIBUTOR > VIEWER) using roleAtLeast(). requireProjectAccess(minRole, projectId) combines both: a valid session AND membership/tenancy access to that specific project. Nearly every API route under /api/projects/[id]/** and /api/admin/** starts with one of these three calls.",
  },
  {
    heading: "7. AI Integration Architecture",
    body:
      "A single src/lib/ai.ts wraps the Anthropic SDK using a server-only ANTHROPIC_API_KEY. Every AI-driven feature — planning, effort estimation, technical recommendation, delivery/pricing recommendation, vendor scoring, the natural-language project Q&A, and the generic \"propose an edit\" endpoint — is its own server route that constructs a purpose-built prompt and returns structured JSON the UI already knows how to render. The generic AI-edit endpoint (and its AiEditChat component) is the one AI surface reused verbatim across six different tabs (Charter, SOW, Deliverables, Risks, Tasks, Solution Options): it proposes a diff, the user reviews it, and only an explicit \"Apply\" writes it.",
  },
  {
    heading: "8. Document Export Architecture",
    body:
      "src/lib/docxExport.ts is the shared formal-document builder: a DocMeta type (documentType, projectName, companyName, status, timestamps, approval info) drives a cover page, a real Word TableOfContents field (scanning Heading 1-3 styles — populated by Word on open, not hand-built), an inferred revision-history table, and a running branded header/footer, wrapped around either a plain sectioned body (buildSectionedDocx) or a test-case table (buildTestCaseDocx). PDF and PPTX exports share an equivalent brand module (src/lib/brand.ts) for consistent colors/logo/footer across formats. Batch export (all deliverables at once) reuses the same builders inside a JSZip archive, scoped through the same tenancy rule as everywhere else.",
  },
  {
    heading: "9. Theming System",
    body:
      "Tailwind v4's @theme inline block exposes --color-accent-* utilities that resolve to --accent-* custom properties, which are then overridden per [data-theme=\"...\"] attribute on <html>. Each non-default theme reuses one of Tailwind's own built-in oklch color ramps (shifted one stop darker where needed for AA text contrast) rather than hand-picked hex, so all six themes stay visually coherent with Tailwind's own design system. A blocking inline script in the root layout's <head> applies the saved theme before first paint (avoiding a flash of the wrong theme); ThemeSwitcher itself reads the same localStorage key via a lazy useState initializer.",
  },
  {
    heading: "10. Issue Reporting Architecture",
    body:
      "IssueReporter.tsx captures a screenshot client-side via html2canvas-pro (a fork of html2canvas with support for modern CSS color functions like oklch()/color-mix(), both used throughout this app's theme system — stock html2canvas cannot parse those and fails). The capture excludes the reporter's own floating panel via ignoreElements. The resulting JPEG data URL, along with the reporter's identity (from the session) and current page path, posts to /api/issues and is stored directly in the issue_reports table (no separate file/blob storage). Admins triage from /admin/issues.",
  },
  {
    heading: "11. Mobile & PWA Architecture",
    body:
      "Responsiveness is handled entirely with Tailwind breakpoints and one piece of client state (AppShell's drawer-open boolean) — there is no separate mobile codebase or route tree. Installability adds a standard web manifest (public/manifest.json), a set of generated icons (including a maskable variant), and a deliberately no-op service worker (public/sw.js) registered client-side — it exists only to satisfy Chrome's installability requirement and performs no caching, since Keel is a fully authenticated, live-data application where stale or cross-user cached content would be a correctness/security risk.",
  },
  {
    heading: "12. Deployment & Environments",
    body:
      "The app deploys to Vercel from this Git repository. Schema changes are made in src/lib/db/schema.ts and pushed to the database with `npm run db:push` (drizzle-kit push) — the project's established convention throughout its history, rather than the generate+migrate file-based workflow, so there are no accumulated migration files to reconcile. Scheduled report generation runs via Vercel Cron, configured in vercel.json. Environment variables (DATABASE_URL, ANTHROPIC_API_KEY, session secret, optional RESEND_API_KEY for outbound email) are managed in the Vercel project settings.",
  },
  {
    heading: "13. Key Design Decisions & Trade-offs",
    body:
      "- One large schema file over many small ones: easier to see the whole data model at once at this project's size; would need splitting if the schema kept growing indefinitely.\n" +
      "- organizations doubles as both client-company record and tenancy root, rather than a separate companies table: avoided a schema migration and an extra join everywhere tenancy is checked.\n" +
      "- Server-rendered Mermaid diagrams are rasterized client-side and handed to the server as both SVG and PNG, because Mermaid needs a DOM the server doesn't have — this is why batch/server-side exports of Detailed Design deliverables omit the diagram image.\n" +
      "- The service worker intentionally caches nothing: installability was worth adding, offline support was not, given the fully dynamic/authenticated nature of every page.",
  },
];

// ---------------------------------------------------------------------------
// Training Manual
// ---------------------------------------------------------------------------
export const TRAINING_SECTIONS: DocSection[] = [
  {
    heading: "1. Getting Started",
    body:
      "Log in with the email and password (or setup link) an admin gave you. What you see depends on your role: internal staff and PMs see the full portfolio; a client company's users see only their own organization's projects. The left sidebar (or, on a phone, the menu behind the top-left hamburger icon) is how you get everywhere in Keel. Two floating buttons are available on every page: the AI PM avatar (bottom-right) and the bug icon for reporting an issue (stacked just above it).",
  },
  {
    heading: "2. Home",
    body:
      "The landing page after login. Three big entry points: start a new Idea, jump into Project Execution, or get help from Ongoing Support — the three stages of Keel's own lifecycle.",
  },
  {
    heading: "3. Dashboard",
    body:
      "Your portfolio at a glance: project health (RAG), percent complete, budget actual vs. planned, and overdue tasks across every project you can see. Click any project to open it.",
  },
  {
    heading: "4. How Keel Works",
    body:
      "An animated, illustrated walkthrough of the whole product lifecycle. Point a new team member here first.",
  },
  {
    heading: "5. Ideation",
    body:
      "Where a project starts before it's committed. Log brainstorming notes yourself or ask the AI to suggest some. Add solution options with pros/cons and mark one as selected. Set a feasibility score. Optionally get an AI technical recommendation and record an EA review decision. When ready, move the idea's status to \"Ready for Charter\" and create the project.",
  },
  {
    heading: "6. Project Execution — Charter tab",
    body:
      "Fill in or AI-draft the project's charter: sponsor, requirements, architecture, options considered, funding, contingency, ongoing support plan. Use \"Draft with AI\" for a first pass, or open the AI chat on this tab to ask for specific edits (it shows you a diff before anything is applied). A charter must be approved before the project can move forward — use the Approve action once it is ready.",
  },
  {
    heading: "7. Project Execution — Planning/Tasks tab",
    body:
      "Pick a methodology (Waterfall, Scrum, or Hybrid) — this changes how tasks are grouped. Use the AI planner to generate a full task breakdown from the charter, including effort estimates and auto-assignment by required skill/experience. Add or edit tasks by hand any time; each task can note its execution source (AI/Internal/Vendor). Scrum/Hybrid projects also get a Sprint Board (kanban, velocity, burndown) under Sprints.",
  },
  {
    heading: "8. Project Execution — Resources & Delivery/Pricing tabs",
    body:
      "Assign resources to the project; allocation percentages compute automatically from estimated effort. Use \"Recommend delivery & pricing\" for an AI suggestion on role mix, onsite/offshore/contractor split, and Fixed Bid vs. Time & Materials — with a written rationale you can accept or override.",
  },
  {
    heading: "9. Project Execution — Risks, Communications, Milestones tabs",
    body:
      "Log risks and communications as they happen — use \"Draft with AI\" if you just want to describe what happened in plain language and let Keel structure it. Track key dates on Milestones, optionally tied to a specific SOW.",
  },
  {
    heading: "10. Project Execution — Status/Reports tab",
    body:
      "Generate a status report or steering-committee pack any time, or let the scheduled cadence (set in Admin > Automation Settings) generate one automatically. Every report can be downloaded as a branded PDF or PowerPoint, including a Planned-vs-Actual chart.",
  },
  {
    heading: "11. Project Execution — SOW tab",
    body:
      "Create a Statement of Work — AI-drafted from the charter or written from scratch — and track it through Draft, Approved, Pending Signature, Signed, Active, and Completed/Terminated. Download the formal Word version any time; once countersigned, upload the signed copy to the same record.",
  },
  {
    heading: "12. Project Execution — Deliverables & QA tabs",
    body:
      "Create deliverables by type (Requirements, Design, Test Scripts, Release Docs, Other). Detailed Design deliverables can include an AI-generated architecture diagram. Test-script deliverables hold a table of test cases you can run and mark Pass/Fail/Blocked — release readiness follows from these results. Every deliverable downloads as a formal Word document; from the Projects list, \"Export all deliverables\" downloads every deliverable across every project you can see as one .zip.",
  },
  {
    heading: "13. Ongoing Support",
    body:
      "Log and track incidents/support tickets portfolio-wide, optionally linked to a project, with severity and an AI recommendation for how to resolve it. The cost estimator here projects ongoing monthly support spend from the same rate cards used in Delivery & Pricing.",
  },
  {
    heading: "14. All Projects",
    body:
      "The full list of every project you can see, sortable by health, with the same portfolio-wide \"export all deliverables\" button as the dashboard.",
  },
  {
    heading: "15. AI Assistant",
    body:
      "The floating avatar (bottom-right of every page) is your AI PM — ask it plain-language questions and it answers about the specific project you're viewing, or the whole portfolio if you're not inside a project. It also has quick-action buttons (brief me, what's blocking us, start a project, draft an RFP). Its voice is off by default (captions only) — click the speaker icon to turn it on.",
  },
  {
    heading: "16. Reports (internal staff)",
    body:
      "Portfolio-wide report exports (project rollups, executive one-pagers) for internal staff and PMs — not visible to client-company users, who only see their own project's reports.",
  },
  {
    heading: "17. Resources & Rate Cards (internal staff)",
    body:
      "Manage the internal roster of people (skills, experience, sourcing type) and the rate cards that price them, either globally or per client company. A SUPER_USER manages only their own company's rate cards from their Organization page.",
  },
  {
    heading: "18. Vendor Evaluation & Vendor Scorecard",
    body:
      "Build an RFP (from a project's charter or from scratch), define weighted criteria, and invite vendors by email — they respond through a no-login link, no account needed on their end. Once responses are in, get an AI-scored comparison and recommendation. The separate Vendor Scorecard page shows each vendor's track record across every project they've delivered on, for future sourcing decisions.",
  },
  {
    heading: "19. Admin — Users & Companies",
    body:
      "(ADMIN only.) Create client companies together with their first owner account, manage every user's role and company assignment, approve or reject public self-registration requests, reset a user's password or send them a self-service setup link, and manage per-company rate cards.",
  },
  {
    heading: "20. Admin — Audit Log & User Activity",
    body:
      "(ADMIN only.) Audit Log is a trace of every sensitive action (approvals, rate changes, role changes, deletions) — who, what, when. User Activity shows login counts and a recent feed of logins and public-link visits, for a quick read on who is actually using Keel.",
  },
  {
    heading: "21. Admin — Issue Reports",
    body:
      "(ADMIN only.) Every bug/feedback report submitted through the floating report button, with its auto-captured screenshot, filterable by status. Change a report's status (Open, In Progress, Resolved, Won't Fix) as you work through it — the reporter's name and email are shown so you can follow up.",
  },
  {
    heading: "22. Admin — Documentation",
    body:
      "(ADMIN only.) This section — download the current Requirements Specification, Design Document, and this Training Manual as formal Word documents any time you need to refresh your memory or hand them to someone new.",
  },
  {
    heading: "23. Reporting an Issue or Giving Feedback",
    body:
      "Click the bug icon (bottom-right, just above the AI avatar) on any page. Keel automatically captures a screenshot of what you were looking at — no permission prompt, it happens instantly. Type what went wrong or what you'd like to see changed, and send. An admin will see it in Admin > Issue Reports.",
  },
  {
    heading: "24. Switching Themes",
    body:
      "Open the sidebar (or the mobile drawer) and use the row of colored dots near the bottom to switch between six color themes instantly. Your choice is remembered on that browser/device.",
  },
  {
    heading: "25. Installing Keel on Your Phone",
    body:
      "On Android (Chrome): open the site, tap the browser menu, and choose \"Add to Home screen\" or \"Install app.\" On iPhone (Safari): open the site, tap the Share icon, then \"Add to Home Screen.\" Either way you get a Keel icon on your home screen that opens full-screen, like a native app — no app store involved.",
  },
  {
    heading: "26. Account & Logout",
    body:
      "Your name and role are shown at the bottom of the sidebar; use the logout icon next to it to sign out. Privacy Policy and Terms of Service are linked from the same footer on every page.",
  },
];
