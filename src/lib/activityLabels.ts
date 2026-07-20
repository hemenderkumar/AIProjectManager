// Turns an API mutation request (method + path) into a short, human-readable activity
// label, e.g. POST /api/projects/abc/tasks -> "Created a task". Used by middleware.ts to
// build a generic "what did this user do" trail covering the many day-to-day PM entities
// (tasks, risks, communications, milestones, invoices, sprints, time entries, etc.) that
// don't have their own bespoke logAudit() call. Entities that already have rich, bespoke
// audit entries (SOWs, Deliverables, RFPs, rate cards, organization/admin management, the
// Plan-sequence gate actions) are deliberately excluded here so we don't double-log the
// same request in two different words -- see the exclusion lists below.

const VERB_BY_METHOD: Record<string, string> = {
  POST: "Created",
  PATCH: "Updated",
  PUT: "Updated",
  DELETE: "Deleted",
};

// Per-resource overrides where "Created"/"Deleted" reads awkwardly.
const VERB_OVERRIDES: Record<string, Partial<Record<"POST" | "PATCH" | "PUT" | "DELETE", string>>> = {
  members: { POST: "Added", DELETE: "Removed" },
};

// path segment -> singular display name. Checked against every segment in the URL; the
// LAST (deepest/rightmost) match wins, so a nested path like
// /api/projects/[id]/tasks/[taskId]/time-entries picks "time-entries", not "projects".
const RESOURCE_LABELS: Record<string, string> = {
  projects: "project",
  tasks: "task",
  risks: "risk",
  communications: "communication log entry",
  "solution-options": "solution option",
  milestones: "milestone",
  invoices: "invoice",
  sprints: "sprint",
  "brainstorm-entries": "brainstorm entry",
  members: "project member",
  "delivery-mix": "delivery role mix",
  stakeholders: "project stakeholder",
  "status-updates": "status update",
  "time-entries": "time entry",
  "test-cases": "test case",
  incidents: "incident",
  issues: "issue report",
};

// Whole request excluded outright -- AI drafting/chat, auth, the activity logger itself,
// admin tools, org management, rate cards, RFPs, exports/report generation, cron jobs,
// public no-login endpoints, and SOWs/Deliverables (both already have full bespoke
// logAudit coverage across their create/update/approve/signed-copy routes).
const EXCLUDED_PREFIXES = [
  "/api/ai/",
  "/api/auth/",
  "/api/activity/",
  "/api/admin/",
  "/api/organization/",
  "/api/rate-cards",
  "/api/rfps",
  "/api/reports/",
  "/api/cron/",
  "/api/update/",
  "/api/status-requests",
  "/api/me/",
  "/api/portfolio",
  "/api/resources/", // master resource records (not project allocations) -- audited via resources/[id]
  "/api/deliverables",
  "/api/sows",
];

// Individual path segments that, if present anywhere in the URL, mean "skip" -- gate
// actions and other routes that already call logAudit() directly with richer detail than
// a generic label could give, plus a couple of read-only/computed endpoints.
const EXCLUDED_SEGMENTS = new Set([
  "override-advance",
  "resourcing-decision",
  "idea-reviewers",
  "charter-pdf",
  "charter-docx",
  "release-readiness",
  "deliverables",
  "sows",
  "candidates",
  "recalculate",
]);

export function labelForApiMutation(method: string, pathname: string): string | null {
  const verb = VERB_BY_METHOD[method as keyof typeof VERB_BY_METHOD];
  if (!verb || !pathname.startsWith("/api/")) return null;
  if (EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  const segments = pathname.split("/").filter(Boolean); // ["api","projects","<id>","tasks","<id>"]
  if (segments.some((s) => EXCLUDED_SEGMENTS.has(s))) return null;

  let resource: string | null = null;
  let matchedSegment: string | null = null;
  for (const seg of segments) {
    if (seg === "resources") {
      // Ambiguous word: /api/projects/[id]/resources (allocations) vs. top-level
      // /api/resources (master records, already excluded above by prefix so this branch
      // only ever fires for the nested, project-scoped case).
      resource = "resource allocation";
      matchedSegment = "resources";
      continue;
    }
    if (RESOURCE_LABELS[seg]) {
      resource = RESOURCE_LABELS[seg];
      matchedSegment = seg;
    }
  }
  if (!resource || !matchedSegment) return null;

  const overrideVerb = VERB_OVERRIDES[matchedSegment]?.[method as keyof (typeof VERB_OVERRIDES)[string]];
  const finalVerb = overrideVerb ?? verb;
  const article = /^[aeiou]/i.test(resource) ? "an" : "a";
  const article_or_the = finalVerb === "Created" || finalVerb === "Added" ? article : "the";
  return `${finalVerb} ${article_or_the} ${resource}`;
}
