import { db } from "./db";
import { notifications } from "./db/schema";
import { sendEmail } from "./email";
import type { notificationTypeEnum } from "./db/schema";

type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

// Single entry point for writing to the in-app notification feed (#262) -- always inserts
// the row (so the bell/digest have something to show) and, if the recipient's email is
// known, best-effort emails them too via the existing sendEmail util. Never throws past its
// own boundary, matching the fire-and-forget convention used by keelconnect/notify.ts.
export async function notify(opts: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  email?: string | null;
}): Promise<void> {
  try {
    await db.insert(notifications).values({
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      link: opts.link ?? null,
    });
  } catch (err) {
    console.error("notification write failed:", err);
  }
  if (opts.email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const text = opts.link ? `${opts.body ?? ""}\n\n${appUrl}${opts.link}` : opts.body ?? "";
    sendEmail(opts.email, opts.title, text).catch(() => false);
  }
}

// Simple @mention detector: for each candidate (a project member), checks whether the
// comment body contains "@<their name>" (case-insensitive substring match) -- no tokenizer,
// no markup, just the same plain-text convention Slack/GitHub comments popularized. Good
// enough for a first version; a richer version would need the comment box itself to insert
// a structured mention token rather than free text.
export function findMentionedMembers<T extends { userId: string; name: string }>(body: string, members: T[]): T[] {
  const lower = body.toLowerCase();
  return members.filter((m) => m.name && lower.includes(`@${m.name.toLowerCase()}`));
}
