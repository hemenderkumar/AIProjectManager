import type { SessionUser } from "./auth";
import { roleAtLeast } from "./auth";

// A single, hand-maintained description of what Executa can actually do, organized by area,
// with the minimum role each area needs noted in brackets. Threaded into the AI PM's system
// prompts (portfolio-wide /api/ai/ask and project-scoped /api/ai/project-chat) so its guidance
// is grounded in the real product surface -- not generic PM-assistant chatter -- and doesn't
// walk someone through a screen their role can't reach. Update this alongside any new feature
// area the same way reapply-all-migrations.sql gets updated alongside schema changes -- it's
// the AI's only source of truth for "what exists," so a feature that isn't listed here is
// invisible to it.
const CAPABILITIES = `
Executa's features, by area (minimum role needed is noted in brackets):

PORTFOLIO & DASHBOARD
- Portfolio dashboard: KPI/health scores, at-a-glance status across every visible project. [VIEWER]
- Global search across projects, tasks, RFPs, etc. [VIEWER]
- Roadmap: quick-win vs. long-term prioritization view, AI-assisted grouping and revision. [CONTRIBUTOR]

IDEATION & INTAKE
- New Idea capture, brainstorm log, options. [CONTRIBUTOR]
- Idea reviewers: invite people to approve an idea (unanimous-approval gate before it advances).
  [PM+ to invite reviewers; anyone invited can respond]
- Technical Feasibility review, Architecture Review (with an AI-generated architecture diagram),
  Charter approval, and Resourcing Decision (internal staffing vs. vendor -- auto-drafts an RFP
  from the charter when vendor is chosen). [PM+]
- Demand management: anyone can submit a demand request (no login required); triage, score,
  decide, and convert-to-project are privileged actions. [submit: anyone; triage/score/decide/
  convert: SUPER_USER+ or ADMIN]
- Project templates: start a new project from a saved skeleton, with an optional "customize with
  AI" step before creating. [CONTRIBUTOR to use a template; PM+ to save a project as one]

PROJECT EXECUTION
- Charter (AI draft available), SOW (AI draft + Word export + approval), Deliverables (test
  cases, traceability to tasks, Word export + approval), Tasks (kanban/sprint board, phases,
  velocity/burndown, dependencies/Gantt view, AI auto-planning and effort estimation, GitHub
  issue/PR links), Risks (AI drafting available), Solution Options, Communications log, Time
  entries, Invoices, Delivery & Pricing (rate cards, role mix), Resourcing.
  [CONTRIBUTOR to view/edit most day-to-day items; PM+ for approvals, Danger Zone, and mapping a
  project to a company]
- RFP / Vendor Evaluation: draft an RFP from a charter, invite vendors (they respond without
  logging in), AI scoring and comparison, vendor performance scorecards. [PM+]
- Reports: weekly status reports and steering-committee decks (PDF/PPTX, planned-vs-actual
  charts, one-pager option), can be scheduled to run automatically. [VIEWER to view; PM+ to
  generate/schedule]
- Content templates: reusable skeletons and AI style presets for RFP/SOW/status-report drafting.
  [PM+]

ONGOING SUPPORT
- Incident management: log incidents, SLA/MTTR tracking, timeline, follow-up tasks, escalation,
  a cost estimator. [CONTRIBUTOR to log an incident; PM+ to manage SLAs/assignment]

INTEGRATIONS (Settings > Integrations page) [SUPER_USER+ only]
- API keys: create a Bearer key (looks like exta_...) to call Executa's public API at
  /api/public/v1/*. Keys default to read-only; write scope additionally lets the caller create
  tasks, incidents, demand requests, and ideas from outside Executa. The public API supports
  create (POST) and read (GET) only -- there's no update/delete endpoint for external systems
  yet.
- Webhooks: register a destination URL and pick from these events -- TASK_STATUS_CHANGED,
  PROJECT_STAGE_CHANGED, DELIVERABLE_APPROVED, RISK_CREATED, INCIDENT_CREATED,
  INCIDENT_STATUS_CHANGED, INCIDENT_ESCALATED, DEMAND_REQUEST_CREATED,
  DEMAND_REQUEST_STATUS_CHANGED, IDEA_CREATED, IDEA_STAGE_CHANGED. Executa POSTs a signed
  (HMAC-SHA256, header X-Executa-Signature) JSON payload whenever a subscribed event fires. This
  is the path for wiring up Jira, Asana, Monday.com, or a generic automation tool: point the
  webhook at a Zapier "Catch Hook" trigger or Make.com webhook (or the other tool's own inbound
  webhook URL if it has one), and it fires automatically with no polling.
- GitHub: a manual one-way link from a task to a GitHub issue/PR (pasted in on the task itself)
  -- no OAuth app or API key needed, and it does not sync status back and forth.
- Slack: paste a Slack Incoming Webhook URL into a project's own Overview tab to get task-
  activity notifications posted to that channel. [PM+, configured per project, not org-wide]

ADMINISTRATION
- Organization/company management, divisions, stakeholders, inviting users and assigning their
  role. [SUPER_USER+ for their own company; ADMIN for any company]
- Custom fields and per-project workflow stage configuration. [SUPER_USER+]
- Automation rules engine (if/then rules across the portfolio). [SUPER_USER+]
- Rate cards (internal cost basis used in pricing/estimation). [SUPER_USER+]
- Branding (logo/accent color) and feature toggles by plan tier, audit log, issue/feedback
  reports, billing/subscription. [ADMIN]

Role hierarchy, low to high: VIEWER < CONTRIBUTOR < PM < SUPER_USER < ADMIN. Each tier includes
everything the tiers below it can do. A SUPER_USER acts like a PM/approver across their own
company's projects but can't touch platform-wide/internal-only tools reserved for ADMIN.
`.trim();

export function getCapabilitiesContext(user: SessionUser): string {
  return `${CAPABILITIES}

This user's role is ${user.role}. When they ask how to do something their role doesn't allow,
say so plainly and name who can help (e.g. "that needs a Super User or Admin on your team"),
rather than walking them through steps for a screen they can't reach. When their role DOES allow
it, give concrete, Executa-specific steps -- name the actual page/tab/button -- not generic PM
advice.`;
}

// Whether this user's role can manage API keys/webhooks (Settings > Integrations) -- the same
// gate /api/api-keys and /api/webhooks enforce server-side. The AI PM is told this so it only
// ever offers to draft an integration action for someone who could actually create one; even so,
// every route that executes the action re-checks the role itself rather than trusting the model.
export function canManageIntegrations(user: SessionUser): boolean {
  return roleAtLeast(user.role, "SUPER_USER");
}
