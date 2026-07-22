// Minimal RFC 5545 calendar feed builder -- just enough for "task due dates as all-day events
// in a subscribable feed," not a general-purpose ICS library. Kept dependency-free since the
// format is small and this app has no other iCalendar need.

function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function formatIcsDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  date: Date;
};

export function buildIcsFeed(calendarName: string, events: IcsEvent[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Keel//Task Calendar Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  for (const e of events) {
    const day = formatIcsDate(e.date);
    const next = formatIcsDate(new Date(e.date.getTime() + 24 * 60 * 60 * 1000));
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@keel`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next}`,
      `SUMMARY:${escapeIcsText(e.title)}`
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
