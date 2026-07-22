import { NextRequest, NextResponse } from "next/server";
import { askClaudeJSON } from "@/lib/ai";
import { ENTITY_CONFIG, describeSnapshot, type EntityType } from "@/lib/aiEditEntities";
import { requireProjectAccess } from "@/lib/tenancy";
import { requireScOrgRole, requireScPlatform, canAccessScAgreement } from "@/lib/keelconnect/access";
import { getCurrentUser, requireRole } from "@/lib/auth";

type EditProposal = { changes: Record<string, string | number | boolean | null>; explanation: string };

// A KeelConnect Agreement can have two or three party orgs (Client + Vendor, or + Platform
// for Mediator), so no single scOrganizationId/role-set captures "any party admin" the way
// requireScOrgRole expects. This just gates who may PROPOSE an edit (read-level access to the
// agreement); the real authorization -- and the ACTIVE-status change-request detour -- is
// enforced independently by the agreement's own PATCH route regardless of what happens here.
async function resolveKeelConnectAgreementUser(entityId: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  return (await canAccessScAgreement(user, entityId)) ? user : null;
}

// The generic "edit anything via AI chat" endpoint: wherever a record was created (by AI or by
// hand), this lets the user describe a change in plain language instead of only editing fields
// one at a time. It only PROPOSES a field diff here — nothing is written to the database from
// this route. Applying a proposal always goes through that entity's own existing PATCH route
// (see ENTITY_CONFIG[type].patchUrl), so every side effect and permission check that route
// already enforces (audit logging, status-transition stamps, the single-selected-option
// invariant, etc.) still applies exactly as if the user had typed the change into the field
// themselves.
export async function POST(req: NextRequest) {
  const { entityType, entityId, instruction } = await req.json().catch(() => ({}));
  if (!entityType || !entityId || !instruction?.trim()) {
    return NextResponse.json({ error: "entityType, entityId, and instruction are required" }, { status: 400 });
  }

  const config = ENTITY_CONFIG[entityType as EntityType];
  if (!config) return NextResponse.json({ error: "Unknown entity type" }, { status: 400 });

  const loaded = await config.load(entityId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Several access-control systems share this one endpoint -- see the comment on
  // ENTITY_CONFIG in aiEditEntities.ts. KeelConnect org/vendor/client entities are scoped to
  // an org + a set of KeelConnect roles; "keelconnect-platform" is the admin-console-only
  // counterpart gated to Platform Admin/Compliance instead of that org's own roles; "admin"
  // is Keel Deliver's own platform-wide admin console (no project or org scoping at all);
  // everything else (the default) is a project-scoped Deliver entity.
  const user =
    config.system === "keelconnect"
      ? (await requireScOrgRole(loaded.scOrganizationId!, config.scRoles!))?.user ?? null
      : config.system === "keelconnect-platform"
      ? (await requireScPlatform(["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER"]))?.user ?? null
      : config.system === "keelconnect-agreement"
      ? await resolveKeelConnectAgreementUser(entityId)
      : config.system === "admin"
      ? await requireRole("ADMIN")
      : await requireProjectAccess(config.minRole!, loaded.projectId!);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const snapshot = describeSnapshot(config.fields, loaded.row);
  const fieldList = config.fields.map((f) => `${f.key} (${f.label}, ${f.kind})`).join(", ");

  const system = `You are editing an existing ${config.label} in a project tracker based on a plain-language
instruction from the user. You may ONLY change fields from this list: ${fieldList}. Do not change anything
the instruction doesn't actually imply — return ONLY the fields that should change, omitting everything else.
If the instruction is unclear, out of scope for this record, or doesn't map to any available field, return
an empty "changes" object and explain why in "explanation" rather than guessing.

Current values:
${snapshot}

User's instruction: "${instruction}"

Respond as JSON: { "changes": { "<fieldKey>": <new value> }, "explanation": string (1-2 sentences on what
you changed and why, or why nothing was changed) }`;

  const { data, error } = await askClaudeJSON<EditProposal>(system, "Propose the edit now.", 3000);
  if (error || !data) return NextResponse.json({ error: error || "No response from the AI model" }, { status: 502 });

  // Defensive filter: only ever pass through keys that are actually on this entity's whitelist,
  // regardless of what the model returned.
  const allowedKeys = new Set(config.fields.map((f) => f.key));
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data.changes ?? {})) {
    if (allowedKeys.has(key)) changes[key] = value;
  }

  return NextResponse.json({
    changes,
    explanation: data.explanation ?? "",
    projectId: loaded.projectId,
    current: loaded.row,
    patchUrl: config.patchUrl(entityId, loaded.projectId),
    fieldLabels: Object.fromEntries(config.fields.map((f) => [f.key, f.label])),
  });
}
