import { FlaskConical } from "lucide-react";

// ProjectRequesta has no real customers yet -- every org/project seeded before the
// isDemoData column existed is flagged true (see add-projectrequesta-demo-flag.sql). This
// badge is the one visible signal, shown on marketplace listings and detail pages, that a
// vendor is looking at a seed scenario rather than a real posting -- paired with a
// server-side block on actually placing a bid against one (see the bids route).
export function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
      <FlaskConical size={12} /> Demo
    </span>
  );
}
