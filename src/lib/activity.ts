import { db } from "./db";
import { activityEvents } from "./db/schema";

/** Records one row in the lightweight activity log (logins, public-link visits, in-app
 * page views, and generic create/edit/delete actions -- see middleware.ts for how
 * PAGE_VIEW/ACTION rows get here). Never throws — recording a visit should never block
 * the page/login/request from working. */
export async function logActivity(opts: {
  type: "LOGIN" | "PUBLIC_VISIT" | "PAGE_VIEW" | "ACTION";
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
