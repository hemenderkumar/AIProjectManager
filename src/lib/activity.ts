import { db } from "./db";
import { activityEvents } from "./db/schema";

/** Records one row in the lightweight activity log (logins + public-link visits). Never
 * throws — recording a visit should never block the page/login from working. */
export async function logActivity(opts: {
  type: "LOGIN" | "PUBLIC_VISIT";
  userId?: string | null;
  userName?: string | null;
  path?: string;
  detail?: string;
}) {
  try {
    await db.insert(activityEvents).values({
      type: opts.type,
      userId: opts.userId ?? null,
      userName: opts.userName ?? null,
      path: opts.path,
      detail: opts.detail,
    });
  } catch (err) {
    console.error("activity log write failed:", err);
  }
}
