import { eq } from "drizzle-orm";
import { db } from "./db";
import { projectMembers, users } from "./db/schema";
import { notify } from "./notifications";
import { roleAtLeast, type SessionUser } from "./auth";

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

const ALLOWED_ATTACHMENT_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

export type ReviewDecision = "APPROVE" | "REQUEST_CHANGES";

// Client-side reviewers: users inside a client organization with at least CONTRIBUTOR tier.
// A client VIEWER can read and comment but cannot sign anything off.
export function canClientDecide(user: SessionUser): boolean {
  return user.organizationId != null && roleAtLeast(user.role, "CONTRIBUTOR");
}

// "CLIENT" for users inside a client organization, "TEAM" for the delivery side (internal
// staff, who have no organization).
export function authorSideFor(user: SessionUser): "CLIENT" | "TEAM" {
  return user.organizationId != null ? "CLIENT" : "TEAM";
}

export type DecisionValidation =
  | { ok: true; status: "APPROVED" | "CHANGES_REQUESTED"; note: string }
  | { ok: false; error: string };

export function validateDecision(decision: unknown, note: unknown, currentStatus: string): DecisionValidation {
  if (decision !== "APPROVE" && decision !== "REQUEST_CHANGES") {
    return { ok: false, error: "decision must be APPROVE or REQUEST_CHANGES" };
  }
  if (currentStatus !== "IN_REVIEW") {
    return { ok: false, error: "Only deliverables that are in review can be approved or sent back" };
  }
  const text = typeof note === "string" ? note.trim() : "";
  if (decision === "REQUEST_CHANGES" && !text) {
    return { ok: false, error: "Please describe the changes you need" };
  }
  if (text.length > 5000) return { ok: false, error: "Note is too long (max 5000 characters)" };
  return { ok: true, status: decision === "APPROVE" ? "APPROVED" : "CHANGES_REQUESTED", note: text };
}

export type AttachmentValidation =
  | { ok: true; filename: string; mime: string; size: number; data: string }
  | { ok: false; error: string };

// Accepts { filename, mime, dataBase64 } where dataBase64 may be a full data: URL.
export function validateAttachment(input: unknown): AttachmentValidation {
  const a = input as { filename?: unknown; mime?: unknown; dataBase64?: unknown } | null;
  if (!a || typeof a.filename !== "string" || typeof a.dataBase64 !== "string") {
    return { ok: false, error: "Attachment needs filename and dataBase64" };
  }
  const filename = a.filename.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "file";
  let mime = typeof a.mime === "string" ? a.mime : "";
  let data = a.dataBase64;
  const m = /^data:([^;]+);base64,/.exec(data);
  if (m) {
    if (!mime) mime = m[1];
    data = data.slice(m[0].length);
  }
  if (!ALLOWED_ATTACHMENT_MIME.has(mime)) return { ok: false, error: "That file type isn't allowed" };
  const clean = data.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const size = Math.floor((clean.length * 3) / 4) - padding;
  if (size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "File is too large (max 4 MB)" };
  if (!/^[A-Za-z0-9+/=\s]*$/.test(data)) return { ok: false, error: "Attachment is not valid base64" };
  return { ok: true, filename, mime, size, data };
}

// Notify the delivery team (project members who are internal staff or PM+), excluding the
// actor. Best-effort: notify() never throws.
export async function notifyDeliveryTeam(opts: {
  projectId: string;
  actor: SessionUser;
  title: string;
  body: string;
}) {
  const members = await db
    .select({ id: users.id, email: users.email, role: users.role, organizationId: users.organizationId })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, opts.projectId));
  const targets = members.filter(
    (m) => m.id !== opts.actor.id && (m.organizationId == null || roleAtLeast(m.role, "PM")),
  );
  await Promise.all(
    targets.map((m) =>
      notify({
        userId: m.id,
        type: "COMMENT",
        title: opts.title,
        body: opts.body,
        link: `/projects/${opts.projectId}`,
        email: m.email,
      }),
    ),
  );
}
