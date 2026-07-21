import { eq, and, or, inArray } from "drizzle-orm";
import { db } from "../db";
import { scOrgMembers, scProjects, scBids, scAgreementParties, scMilestones, scPayments, users } from "../db/schema";
import { getCurrentUser, type SessionUser } from "../auth";

// KeelConnect's own role system -- deliberately separate from Keel Deliver's
// userRoleEnum (ADMIN/SUPER_USER/PM/CONTRIBUTOR/VIEWER). A single Keel login (SessionUser)
// can hold zero or more of these, each scoped to one scOrganization (or, for the three
// PLATFORM_* roles, scoped globally). See the schema.ts comment above scRoleEnum.
export type ScRole =
  | "PLATFORM_ADMIN"
  | "PLATFORM_COMPLIANCE_OFFICER"
  | "PLATFORM_SUPPORT"
  | "CLIENT_ORG_ADMIN"
  | "CLIENT_REQUESTER"
  | "CLIENT_FINANCE_APPROVER"
  | "VENDOR_ORG_ADMIN"
  | "VENDOR_CONTRIBUTOR";

export const PLATFORM_ROLES: ScRole[] = ["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER", "PLATFORM_SUPPORT"];
export const CLIENT_ROLES: ScRole[] = ["CLIENT_ORG_ADMIN", "CLIENT_REQUESTER", "CLIENT_FINANCE_APPROVER"];
export const VENDOR_ROLES: ScRole[] = ["VENDOR_ORG_ADMIN", "VENDOR_CONTRIBUTOR"];

// KeelConnect roles that MUST have MFA enabled before they can use the marketplace at all
// (checked at login -- see lib/keelconnect/mfa.ts). Per spec: Finance Approver + every
// Platform role.
export const MFA_REQUIRED_ROLES: ScRole[] = ["CLIENT_FINANCE_APPROVER", ...PLATFORM_ROLES];

export function isPlatformRole(role: string): role is ScRole {
  return (PLATFORM_ROLES as string[]).includes(role);
}
export function isClientRole(role: string): boolean {
  return (CLIENT_ROLES as string[]).includes(role);
}
export function isVendorRole(role: string): boolean {
  return (VENDOR_ROLES as string[]).includes(role);
}

export type ScMembership = { scOrganizationId: string | null; role: ScRole };

export async function getScMemberships(userId: string): Promise<ScMembership[]> {
  const rows = await db
    .select({ scOrganizationId: scOrgMembers.scOrganizationId, role: scOrgMembers.role })
    .from(scOrgMembers)
    .where(eq(scOrgMembers.userId, userId));
  return rows as ScMembership[];
}

export type ScUserContext = { user: SessionUser; memberships: ScMembership[] };

// The base building block every KeelConnect route/page starts from: the same Keel login
// (shared session/auth with Keel Deliver) plus whatever KeelConnect org roles that account
// holds. No memberships at all just means "not a KeelConnect participant yet."
export async function requireScUser(): Promise<ScUserContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const memberships = await getScMemberships(user.id);
  return { user, memberships };
}

export function hasPlatformRole(memberships: ScMembership[], roles?: ScRole[]): boolean {
  return memberships.some((m) => m.scOrganizationId == null && (roles ? roles.includes(m.role) : isPlatformRole(m.role)));
}

export function isPlatformAdmin(memberships: ScMembership[]): boolean {
  return hasPlatformRole(memberships, ["PLATFORM_ADMIN"]);
}

// Enforcement point for the spec's "MFA enforced for Finance Approver + all Platform roles"
// requirement. Only queries users.mfaEnabled when at least one of `roles` actually needs
// it -- every other KeelConnect role (Client Org Admin/Requester, Vendor roles) never pays
// this extra query. See lib/keelconnect/mfa.ts for the enrollment/verification flow itself.
export async function isMfaSatisfied(userId: string, roles: ScRole[]): Promise<boolean> {
  if (!roles.some((r) => MFA_REQUIRED_ROLES.includes(r))) return true;
  const [row] = await db.select({ mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, userId));
  return !!row?.mfaEnabled;
}

export function rolesInOrg(memberships: ScMembership[], scOrganizationId: string): ScRole[] {
  return memberships.filter((m) => m.scOrganizationId === scOrganizationId).map((m) => m.role);
}

export function clientOrgIds(memberships: ScMembership[]): string[] {
  return memberships.filter((m) => m.scOrganizationId && isClientRole(m.role)).map((m) => m.scOrganizationId as string);
}

export function vendorOrgIds(memberships: ScMembership[]): string[] {
  return memberships.filter((m) => m.scOrganizationId && isVendorRole(m.role)).map((m) => m.scOrganizationId as string);
}

// Platform Admin sees everything (per spec). Platform Support is given the same read
// breadth here -- support staff can't help troubleshoot a project/agreement/payment they
// literally cannot see -- but is kept as its own named role (not silently aliased to Admin)
// so write-side actions can still be gated more tightly per-route where it matters (e.g.
// only Admin/Compliance can decide a compliance record or dispute). Platform Compliance
// Officer's specific grant (Compliance Records + Disputes, org-agnostic) is enforced by the
// individual entity helpers below, not by this general project-visibility check.
export async function requireScPlatform(roles?: ScRole[]): Promise<ScUserContext | null> {
  const ctx = await requireScUser();
  if (!ctx) return null;
  if (!hasPlatformRole(ctx.memberships, roles)) return null;
  // Every Platform role requires MFA per spec -- checked here so it's impossible for any
  // platform-gated route to forget the check, rather than repeating it at each call site.
  if (!(await isMfaSatisfied(ctx.user.id, roles ?? PLATFORM_ROLES))) return null;
  return ctx;
}

// Requires holding one of `roles` inside this specific scOrganization -- or being Platform
// Admin, who can act on any org for support/override purposes.
export async function requireScOrgRole(scOrganizationId: string, roles: ScRole[]): Promise<ScUserContext | null> {
  const ctx = await requireScUser();
  if (!ctx) return null;
  if (isPlatformAdmin(ctx.memberships)) {
    return (await isMfaSatisfied(ctx.user.id, ["PLATFORM_ADMIN"])) ? ctx : null;
  }
  // Only the roles actually held AND requested matter for the MFA check -- e.g. a Client Org
  // Admin who also happens to hold Finance Approver in the same org must have MFA enabled to
  // use either capability, but a route gating on CLIENT_ORG_ADMIN alone never triggers the
  // check for a user who only holds CLIENT_REQUESTER.
  const heldMatching = rolesInOrg(ctx.memberships, scOrganizationId).filter((r) => roles.includes(r));
  if (!heldMatching.length) return null;
  if (!(await isMfaSatisfied(ctx.user.id, heldMatching))) return null;
  return ctx;
}

// --- Project visibility ---
// Client roles: only their own org's projects. Vendor roles: any OPEN project (the open
// marketplace) plus any project their own org has already bid on (so an accepted bid/awarded
// project doesn't disappear from view once it leaves OPEN status). Platform roles: everything.
export async function canAccessScProject(user: SessionUser, scProjectId: string): Promise<boolean> {
  const memberships = await getScMemberships(user.id);
  if (hasPlatformRole(memberships)) return true;

  const [project] = await db
    .select({ clientOrgId: scProjects.clientOrgId, status: scProjects.status })
    .from(scProjects)
    .where(eq(scProjects.id, scProjectId));
  if (!project) return false;

  if (clientOrgIds(memberships).includes(project.clientOrgId)) return true;

  const myVendorOrgIds = vendorOrgIds(memberships);
  if (!myVendorOrgIds.length) return false;
  if (project.status === "OPEN") return true;

  const [bid] = await db
    .select({ id: scBids.id })
    .from(scBids)
    .where(and(eq(scBids.scProjectId, scProjectId), inArray(scBids.vendorOrgId, myVendorOrgIds)));
  return !!bid;
}

export async function requireScProjectAccess(scProjectId: string): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return (await canAccessScProject(user, scProjectId)) ? user : null;
}

// The "browse" query behind GET /api/keelconnect/projects: same visibility rule as
// canAccessScProject, but expressed as a single list rather than a per-id check. Platform
// roles get every project; everyone else gets the union of "my client org's projects" and
// "OPEN projects, plus any project my vendor org already has a bid on."
export async function listScProjectsForUser(user: SessionUser) {
  const memberships = await getScMemberships(user.id);
  if (hasPlatformRole(memberships)) {
    return db.select().from(scProjects);
  }

  const myClientOrgIds = clientOrgIds(memberships);
  const myVendorOrgIds = vendorOrgIds(memberships);

  if (!myClientOrgIds.length && !myVendorOrgIds.length) return [];

  let awardedProjectIds: string[] = [];
  if (myVendorOrgIds.length) {
    const bidRows = await db
      .select({ scProjectId: scBids.scProjectId })
      .from(scBids)
      .where(inArray(scBids.vendorOrgId, myVendorOrgIds));
    awardedProjectIds = [...new Set(bidRows.map((r) => r.scProjectId))];
  }

  const clauses = [];
  if (myClientOrgIds.length) clauses.push(inArray(scProjects.clientOrgId, myClientOrgIds));
  if (myVendorOrgIds.length) clauses.push(eq(scProjects.status, "OPEN"));
  if (awardedProjectIds.length) clauses.push(inArray(scProjects.id, awardedProjectIds));

  return db.select().from(scProjects).where(or(...clauses));
}

// --- Bid visibility ---
// A bid is visible to: the vendor org that submitted it, the client org that owns the
// project it's against, and any platform role.
export async function canAccessScBid(user: SessionUser, scBidId: string): Promise<boolean> {
  const memberships = await getScMemberships(user.id);
  if (hasPlatformRole(memberships)) return true;

  const [bid] = await db
    .select({ vendorOrgId: scBids.vendorOrgId, scProjectId: scBids.scProjectId })
    .from(scBids)
    .where(eq(scBids.id, scBidId));
  if (!bid) return false;

  if (vendorOrgIds(memberships).includes(bid.vendorOrgId)) return true;

  const [project] = await db.select({ clientOrgId: scProjects.clientOrgId }).from(scProjects).where(eq(scProjects.id, bid.scProjectId));
  return !!project && clientOrgIds(memberships).includes(project.clientOrgId);
}

export async function requireScBidAccess(scBidId: string): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return (await canAccessScBid(user, scBidId)) ? user : null;
}

// --- Agreement visibility ---
// Visible to any scOrganization listed as a party on the agreement (Client and/or Vendor --
// Platform is a "party" in mediator mode but isn't an org, so platform visibility is granted
// via the role check, not a party row), plus any platform role.
export async function canAccessScAgreement(user: SessionUser, scAgreementId: string): Promise<boolean> {
  const memberships = await getScMemberships(user.id);
  if (hasPlatformRole(memberships)) return true;

  const parties = await db
    .select({ scOrganizationId: scAgreementParties.scOrganizationId })
    .from(scAgreementParties)
    .where(eq(scAgreementParties.scAgreementId, scAgreementId));
  const partyOrgIds = new Set(parties.map((p) => p.scOrganizationId).filter(Boolean) as string[]);

  const myOrgIds = [...clientOrgIds(memberships), ...vendorOrgIds(memberships)];
  return myOrgIds.some((id) => partyOrgIds.has(id));
}

export async function requireScAgreementAccess(scAgreementId: string): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return (await canAccessScAgreement(user, scAgreementId)) ? user : null;
}

// --- Payment visibility ---
// A payment hangs off Milestone -> Agreement -> Parties, so it inherits the agreement's
// visibility rule directly.
export async function canAccessScPayment(user: SessionUser, scPaymentId: string): Promise<boolean> {
  const memberships = await getScMemberships(user.id);
  if (hasPlatformRole(memberships)) return true;

  const [payment] = await db.select({ scMilestoneId: scPayments.scMilestoneId }).from(scPayments).where(eq(scPayments.id, scPaymentId));
  if (!payment) return false;
  const [milestone] = await db.select({ scAgreementId: scMilestones.scAgreementId }).from(scMilestones).where(eq(scMilestones.id, payment.scMilestoneId));
  if (!milestone) return false;
  return canAccessScAgreement(user, milestone.scAgreementId);
}

// --- Compliance / Disputes ---
// Per spec: Platform Compliance Officer (and Admin) see these across every org, regardless
// of any org-membership the officer personally holds. A Client/Vendor org role only sees
// its own org's compliance records, and its own project/agreement's disputes.
export async function canAccessScComplianceRecord(user: SessionUser, scOrganizationId: string): Promise<boolean> {
  const memberships = await getScMemberships(user.id);
  if (hasPlatformRole(memberships, ["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER", "PLATFORM_SUPPORT"])) return true;
  return rolesInOrg(memberships, scOrganizationId).length > 0;
}

export async function canAccessScDispute(
  user: SessionUser,
  dispute: { scProjectId: string | null; scAgreementId: string | null }
): Promise<boolean> {
  const memberships = await getScMemberships(user.id);
  if (hasPlatformRole(memberships)) return true;
  if (dispute.scAgreementId && (await canAccessScAgreement(user, dispute.scAgreementId))) return true;
  if (dispute.scProjectId && (await canAccessScProject(user, dispute.scProjectId))) return true;
  return false;
}
