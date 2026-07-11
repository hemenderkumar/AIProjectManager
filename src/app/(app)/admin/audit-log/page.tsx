"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ArrowLeft } from "lucide-react";

type AuditEntry = {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  organizationId: string | null;
  detail: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  "charter.approved": "Charter approved",
  "stage.approved": "Stage approved",
  "technical_review.decided": "Technical review decided",
  "project.deleted": "Project deleted",
  "user.role_changed": "Role changed",
  "user.deleted": "User deleted",
  "rate_card.updated": "Rate card updated",
  "resource.rate_changed": "Resource rate changed",
  "organization.data_exported": "Data exported",
  "organization.deletion_requested": "Deletion requested",
  "organization.deletion_request_cancelled": "Deletion request cancelled",
  "organization.deletion_dismissed": "Deletion request dismissed",
  "organization.deleted": "Organization deleted",
};

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    (async () => {
      const res = await fetch("/api/admin/audit-log");
      if (res.ok) setEntries(await res.json());
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <Topbar
        title="Audit Log"
        subtitle="Sensitive actions across the platform — approvals, rate changes, role changes, deletions"
        action={
          <Link href="/admin" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <ArrowLeft size={14} /> Back to Admin
          </Link>
        }
      />
      <div className="p-8">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-slate-50 last:border-0 align-top">
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{e.actorName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium bg-slate-100 text-slate-700 rounded-full px-2 py-0.5">
                      {ACTION_LABELS[e.action] ?? e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{e.detail ?? "—"}</td>
                </tr>
              ))}
              {!loading && entries.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-slate-400">No audited actions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
