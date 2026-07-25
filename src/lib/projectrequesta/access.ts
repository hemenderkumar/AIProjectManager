import { eq, and, or, inArray } from "drizzle-orm";
import { db } from "../db";
import { prOrgMembers, prProjects, prBids, prAgreementParties, prMilestones, prPayments, users } from "../db/schema";
import { getCurrentUser, type SessionUser } from "../auth";

// ProjectRequesta's own role system -- deliberately separate from Executa's
// userRoleEnum (ADMIN/SUPER_USER/PM/CONTRIBUTOR/VIEWER). A single Executa login (SessionUser)
// can hold zero or more of these, each scoped to one prOrganization (or, for the three
// PLATFORM_* roles, scoped globally). See the schema.ts comment above prRoleEnum.
export type PrRole =
  | "PLATFORM_ADMIN"
  | "PLATFORM_COMPLIANCE_OFFICER"
  | "PLATFORM_SUPPORT"
  | "CLIENT_ORG_ADMIN"
  | "CLIENT_REQUESTER"
  | "CLIENT_FINANCE_APPROVER"
  | "VENDOR_ORG_ADMIN"
  | "VENDOR_CONTRIBUTOR";

export const PLATFORM_ROLES: PrRole[] = ["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER", "PLATFORM_SUPPORT"];
export const CLIENT_ROLES: PrRole[] = ["CLIENT_ORG_ADMIN", "CLIENT_REQUESTER", "CLIENT_FINANCE_APPROVER"];
export const VENDOR_ROLES: PrRole[] = ["VENDOR_ORG_ADMIN", "VENDOR_CONTRIBUTOR"];

// ProjectRequesta roles that MUST have MFA enabled before they can use the marketplace at all
// (checked at login -- see lib/projectrequesta/mfa.ts). Per spec: Finance Approver + every
// Platform role.
export const MFA_REQUIRED_ROLES: PrRole[] = ["CLIENT_FINANCE_APPROVER", ...PLATFORM_ROLES];

export function isPlatformRole(role: string): role is PrRole {
  return (PLATFORM_ROLES as string[]).includes(role);
}
export function isClientRole(role: string): boolean {
  return (CLIENT_ROLES as string[]).includes(role);
}
export function isVendorRole(role: string): boolean {
  return (VENDOR_ROLES as string[]).includes(role);
}

export type PrMembership = { prOrganizationId: string | null; role: PrRole };

export async function getPrMemberships(userId: string): Promise<PrMembership[]> {
  const rows = await db
    .select({ prOrganizationId: prOrgMembers.prOrganizationId, role: prOrgMembers.role })
    .from(prOrgMembers)
    .where(eq(prOrgMembers.userId, userId));
  return rows as PrMembership[];
}

export type PrUserContext = { user: SessionUser; memberships: PrMembership[] };

// The base building block every ProjectRequesta route/page starts from: the same Executa login
// (shared session/auth with Executa) plus whatever ProjectRequesta org roles that account
// holds. No memberships at all just means "not a ProjectRequesta participant yet."
export async function requirePrUser(): Promise<PrUserContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const memberships = await getPrMemberships(user.id);
  return { user, memberships };
}

export function hasPlatformRole(memberships: PrMembership[], roles?: PrRole[]): boolean {
  return memberships.some((m) => m.prOrganizationId == null && (roles ? roles.includes(m.role) : isPlatformRole(m.role)));
}

export function isPlatformAdmin(memberships: PrMembership[]): boolean {
  return hasPlatformRole(memberships, ["PLATFORM_ADMIN"]);
}

// Enforcement point for the spec's "MFA enforced for Finance Approver + all Platform roles"
// requirement. Only queries users.mfaEnabled when at least one of `roles` actually needs
// it -- every other ProjectRequesta role (Client Org Admin/Requester, Vendor roles) never pays
// this extra query. See lib/projectrequesta/mfa.ts for the enrollment/verification flow itself.
export async function isMfaSatisfied(userId: string, roles: PrRole[]): Promise<boolean> {
  if (!roles.some((r) => MFA_REQUIRED_ROLES.includes(r))) return true;
  const [row] = await db.select({ mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, userId));
  return !!row?.mfaEnabled;
}

export function rolesInOrg(memberships: PrMembership[], prOrganizationId: string): PrRole[] {
  return memberships.filter((m) => m.prOrganizationId === prOrganizationId).map((m) => m.role);
}

export function clientOrgIds(memberships: PrMembership[]): string[] {
  return memberships.filter((m) => m.prOrganizationId && isClientRole(m.role)).map((m) => m.prOrganizationId as string);
}

export function vendorOrgIds(memberships: PrMembership[]): string[] {
  return memberships.filter((m) => m.prOrganizationId && isVendorRole(m.role)).map((m) => m.prOrganizationId as string);
}

// Platform Admin sees everything (per spec). Platform Support is given the same read
// breadth here -- support staff can't help troubleshoot a project/agreement/payment they
// literally cannot see -- but is kept as its own named role (not silently aliased to Admin)
// so write-side actions can still be gated more tightly per-route where it matters (e.g.
// only Admin/Compliance can decide a compliance record or dispute). Platform Compliance
// Officer's specific grant (Compliance Records + Disputes, org-agnostic) is enforced by the
// individual entity helpers below, not by this general project-visibility check.
export async function requirePrPlatform(roles?: PrRole[]): Promise<PrUserContext | null> {
  const ctx = await requirePrUser();
  if (!ctx) return null;
  if (!hasPlatformRole(ctx.memberships, roles)) return null;
  // Every Platform role requires MFA per spec -- checked here so it's impossible for any
  // platform-gated route to forget the check, rather than repeating it at each call site.
  if (!(await isMfaSatisfied(ctx.user.id, roles ?? PLATFORM_ROLES))) return null;
  return ctx;
}

// Requires holding one of `roles` inside this specific prOrganization -- or being Platform
// Admin, who can act on any org for support/override purposes.
export async function requirePrOrgRole(prOrganizationId: string, roles: PrRole[]): Promise<PrUserContext | null> {
  const ctx = await requirePrUser();
  if (!ctx) return null;
  if (isPlatformAdmin(ctx.memberships)) {
    return (await isMfaSatisfied(ctx.user.id, ["PLATFORM_ADMIN"])) ? ctx : null;
  }
  // Only the roles actually held AND requested matter for the MFA check -- e.g. a Client Org
  // Admin who also happens to hold Finance Approver in the same org must have MFA enabled to
  // use either capability, but a route gating on CLIENT_ORG_ADMIN alone never triggers the
  // check for a user who only holds CLIENT_REQUESTER.
  const heldMatching = rolesInOrg(ctx.memberships, prOrganizationId).filter((r) => roles.includes(r));
  if (!heldMatching.length) return null;
  if (!(await isMfaSatisfied(ctx.user.id, heldMatching))) return null;
  return ctx;
}

// --- Project visibility ---
// Client roles: only their own org's projects. Vendor roles: any OPEN project (the open
// marketplace) plus any project their own org has already bid on (so an accepted bid/awarded
// project doesn't disappear from view once it leaves OPEN status). Platform roles: everything.
export async function canAccessPrProject(user: SessionUser, prProjectId: string): Promise<boolean> {
  const memberships = await getPrMemberships(user.id);
  if (hasPlatformRole(memberships)) return true;

  const [project] = await db
    .select({ clientOrgId: prProjects.clientOrgId, status: prProjects.status })
    .from(prProjects)
    .where(eq(prProjects.id, prProjectId));
  if (!project) return false;

  if (clientOrgIds(memberships).includes(project.clientOrgId)) return true;

  const myVendorOrgIds = vendorOrgIds(memberships);
  if (!myVendorOrgIds.length) return false;
  if (project.status === "OPEN") return true;

  const [bid] = await db
    .select({ id: prBids.id })
    .from(prBids)
    .where(and(eq(prBids.prProjectId, prProjectId), inArray(prBids.vendorOrgId, myVendorOrgIds)));
  return !!bid;
}

export async function requirePrProjectAccess(prProjectId: string): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return (await canAccessPrProject(user, prProjectId)) ? user : null;
}

// The "browse" query behind GET /api/projectrequesta/projects: same visibility rule as
// canAccessPrProject, but expressed as a single list rather than a per-id check. Platform
// roles get every project; everyone else gets the union of "my client org's projects" and
// "OPEN projects, plus any project my vendor org already has a bid on."
export async function listPrProjectsForUser(user: SessionUser) {
  const memberships = await getPrMemberships(user.id);
  if (hasPlatformRole(memberships)) {
    return db.select().from(prProjects);
  }

  const myClientOrgIds = clientOrgIds(memberships);
  const myVendorOrgIds = vendorOrgIds(memberships);

  if (!myClientOrgIds.length && !myVendorOrgIds.length) return [];

  let awardedProjectIds: string[] = [];
  if (myVendorOrgIds.length) {
    const bidRows = await db
      .select({ prProjectId: prBids.prProjectId })
      .from(prBids)
      .where(inArray(prBids.vendorOrgId, myVendorOrgIds));
    awardedProjectIds = [...new Set(bidRows.map((r) => r.prProjectId))];
  }

  const clauses = [];
  if (myClientOrgIds.length) clauses.push(inArray(prProjects.clientOrgId, myClientOrgIds));
  if (myVendorOrgIds.length) clauses.push(eq(prProjects.status, "OPEN"));
  if (awardedProjectIds.length) clauses.push(inArray(prProjects.id, awardedProjectIds));

  return db.select().from(prProjects).where(or(...clauses));
}

// --- Bid visibility ---
// A bid is visible to: the vendor org that submitted it, the client org that owns the
// project it's against, and any platform role.
export async function canAccessPrBid(user: SessionUser, prBidId: string): Promise<boolean> {
  const memberships = await getPrMemberships(user.id);
  if (hasPlatformRole(memberships)) return true;

  const [bid] = await db
    .select({ vendorOrgId: prBids.vendorOrgId, prProjectId: prBids.prProjectId })
    .from(prBids)
    .where(eq(prBids.id, prBidId));
  if (!bid) return false;

  if (vendorOrgIds(memberships).includes(bid.vendorOrgId)) return true;

  const [project] = await db.select({ clientOrgId: prProjects.clientOrgId }).from(prProjects).where(eq(prProjects.id, bid.prProjectId));
  return !!project && clientOrgIds(memberships).includes(project.clientOrgId);
}

export async function requirePrBidAccess(prBidId: string): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return (await canAccessPrBid(user, prBidId)) ? user : null;
}

// --- Agreement visibility ---
// Visible to any prOrganization listed as a party on the agreement (Client and/or Vendor --
// Platform is a "party" in mediator mode but isn't an org, so platform visibility is granted
// via the role check, not a party row), plus any platform role.
export async function canAccessPrAgreement(user: SessionUser, prAgreementId: string): Promise<boolean> {
  const memberships = await getPrMemberships(user.id);
  if (hasPlatformRole(memberships)) return true;

  const parties = await db
    .select({ prOrganizationId: prAgreementParties.prOrganizationId })
    .from(prAgreementParties)
    .where(eq(prAgreementParties.prAgreementId, prAgreementId));
  const partyOrgIds = new Set(parties.map((p) => p.prOrganizationId).filter(Boolean) as string[]);

  const myOrgIds = [...clientOrgIds(memberships), ...vendorOrgIds(memberships)];
  return myOrgIds.some((id) => partyOrgIds.has(id));
}

export async function requirePrAgreementAccess(prAgreementId: string): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return (await canAccessPrAgreement(user, prAgreementId)) ? user : null;
}

// --- Payment visibility ---
// A payment hangs off Milestone -> Agreement -> Parties, so it inherits the agreement's
// visibility rule directly.
export async function canAccessPrPayment(user: SessionUser, prPaymentId: string): Promise<boolean> {
  const memberships = await getPrMemberships(user.id);
  if (hasPlatformRole(memberships)) return true;

  const [payment] = await db.select({ prMilestoneId: prPayments.prMilestoneId }).from(prPayments).where(eq(prPayments.id, prPaymentId));
  if (!payment) return false;
  const [milestone] = await db.select({ prAgreementId: prMilestones.prAgreementId }).from(prMilestones).where(eq(prMilestones.id, payment.prMilestoneId));
  if (!milestone) return false;
  return canAccessPrAgreement(user, milestone.prAgreementId);
}

// --- Compliance / Disputes ---
// Per spec: Platform Compliance Officer (and Admin) see these across every org, regardless
// of any org-membership the officer personally holds. A Client/Vendor org role only sees
// its own org's compliance records, and its own project/agreement's disputes.
export async function canAccessPrComplianceRecord(user: SessionUser, prOrganizationId: string): Promise<boolean> {
  const memberships = await getPrMemberships(user.id);
  if (hasPlatformRole(memberships, ["PLATFORM_ADMIN", "PLATFORM_COMPLIANCE_OFFICER", "PLATFORM_SUPPORT"])) return true;
  return rolesInOrg(memberships, prOrganizationId).length > 0;
}

export async function canAccessPrDispute(
  user: SessionUser,
  dispute: { prProjectId: string | null; prAgreementId: string | null }
): Promise<boolean> {
  const memberships = await getPrMemberships(user.id);
  if (hasPlatformRole(memberships)) return true;
  if (dispute.prAgreementId && (await canAccessPrAgreement(user, dispute.prAgreementId))) return true;
  if (dispute.prProjectId && (await canAccessPrProject(user, dispute.prProjectId))) return true;
  return false;
}
