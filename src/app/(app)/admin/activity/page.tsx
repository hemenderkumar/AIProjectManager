"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ArrowLeft, LogIn, Eye, MousePointerClick, Pencil, X } from "lucide-react";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  organizationId: string | null;
  lastLoginAt: string | null;
  loginCount: number;
};
type ActivityEntry = {
  id: string;
  type: "LOGIN" | "PUBLIC_VISIT" | "PAGE_VIEW" | "ACTION";
  userName: string | null;
  path: string | null;
  detail: string | null;
  createdAt: string;
};
type AuditEntry = {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string | null;
  detail: string | null;
  createdAt: string;
};
type Totals = {
  totalLogins: number;
  totalPublicVisits: number;
  totalPageViews: number;
  totalActions: number;
  usersWhoLoggedIn: number;
  totalUsers: number;
};

const TYPE_META: Record<ActivityEntry["type"], { icon: typeof LogIn; label: string; cls: string }> = {
  LOGIN: { icon: LogIn, label: "Login", cls: "bg-accent-50 text-accent-700" },
  PUBLIC_VISIT: { icon: Eye, label: "Visit", cls: "bg-slate-100 text-slate-600" },
  PAGE_VIEW: { icon: MousePointerClick, label: "Page", cls: "bg-sky-50 text-sky-700" },
  ACTION: { icon: Pencil, label: "Action", cls: "bg-emerald-50 text-emerald-700" },
};

export default function UserActivityPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [recent, setRecent] = useState<ActivityEntry[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userTrail, setUserTrail] = useState<ActivityEntry[]>([]);
  const [userAudit, setUserAudit] = useState<AuditEntry[]>([]);
  const [loadingUser, setLoadingUser] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/activity");
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
        setRecent(data.recent ?? []);
        setTotals(data.totals ?? null);
      }
      setLoading(false);
    })();
  }, []);

  async function openUser(u: UserRow) {
    setSelectedUser(u);
    setLoadingUser(true);
    try {
      const res = await fetch(`/api/admin/activity?userId=${u.id}`);
      if (res.ok) {
        const data = await res.json();
        setUserTrail(data.recent ?? []);
        setUserAudit(data.auditEntries ?? []);
      }
    } finally {
      setLoadingUser(false);
    }
  }

  // Merge the two tables (raw trail + curated audit entries) into one chronological list
  // so a reviewer sees everything this person did in one place, not two separate tabs.
  const mergedTimeline = [
    ...userTrail.map((e) => ({ kind: "trail" as const, e })),
    ...userAudit.map((e) => ({ kind: "audit" as const, e })),
  ].sort((a, b) => new Date(b.e.createdAt).getTime() - new Date(a.e.createdAt).getTime());

  return (
    <div>
      <Topbar
        title="User Activity"
        subtitle="Logins, public-link visits, page views, and create/edit/delete actions — click a user for their full trail"
        action={
          <Link href="/admin" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <ArrowLeft size={14} /> Back to Admin
          </Link>
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <Stat label="Users who've logged in" value={totals ? `${totals.usersWhoLoggedIn} / ${totals.totalUsers}` : "—"} />
          <Stat label="Total logins" value={totals ? `${totals.totalLogins}` : "—"} />
          <Stat label="Public link visits" value={totals ? `${totals.totalPublicVisits}` : "—"} />
          <Stat label="Page views" value={totals ? `${totals.totalPageViews}` : "—"} />
          <Stat label="Actions taken" value={totals ? `${totals.totalActions}` : "—"} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Users</p>
            <p className="text-xs text-slate-400">Sorted by most recent login first. Click a row to see everything that person has done.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 font-medium">Name</th>
                  <th className="px-4 py-2.5 font-medium">Email</th>
                  <th className="px-4 py-2.5 font-medium">Role</th>
                  <th className="px-4 py-2.5 font-medium">Last login</th>
                  <th className="px-4 py-2.5 font-medium text-right">Login count</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => openUser(u)}
                    className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-medium text-accent-700">{u.name}</td>
                    <td className="px-4 py-3 text-slate-500">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium bg-slate-100 text-slate-700 rounded-full px-2 py-0.5">{u.role}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{u.loginCount}</td>
                  </tr>
                ))}
                {!loading && users.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400">No users yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ActivityTable title="Recent activity" subtitle="Most recent 200 events across everyone." entries={recent} loading={loading} />
      </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-start justify-center p-6 z-50 overflow-y-auto" onClick={() => setSelectedUser(null)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl mt-10 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-900">{selectedUser.name}</p>
                <p className="text-xs text-slate-400">{selectedUser.email} — full activity trail</p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {loadingUser ? (
                <p className="p-8 text-center text-sm text-slate-400">Loading...</p>
              ) : mergedTimeline.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">No recorded activity for this person yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50 sticky top-0">
                      <th className="px-4 py-2.5 font-medium">When</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium">What</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedTimeline.map(({ kind, e }) => (
                      <tr key={`${kind}-${e.id}`} className="border-b border-slate-50 last:border-0 align-top">
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          {kind === "audit" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 bg-amber-50 text-amber-700">
                              Audited
                            </span>
                          ) : (
                            <TypeBadge type={(e as ActivityEntry).type} />
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {kind === "audit" ? (
                            <>
                              <span className="font-medium text-slate-800">{(e as AuditEntry).action}</span>
                              {(e as AuditEntry).detail ? ` — ${(e as AuditEntry).detail}` : ""}
                            </>
                          ) : (
                            <>
                              {(e as ActivityEntry).detail ?? (e as ActivityEntry).path ?? "—"}
                              {(e as ActivityEntry).type !== "ACTION" && (e as ActivityEntry).path && (e as ActivityEntry).detail ? (
                                <span className="text-xs text-slate-400"> ({(e as ActivityEntry).path})</span>
                              ) : null}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TypeBadge({ type }: { type: ActivityEntry["type"] }) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 ${meta.cls}`}>
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

function ActivityTable({
  title,
  subtitle,
  entries,
  loading,
}: {
  title: string;
  subtitle: string;
  entries: ActivityEntry[];
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-100 bg-slate-50">
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Who</th>
              <th className="px-4 py-2.5 font-medium">Path</th>
              <th className="px-4 py-2.5 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-slate-50 last:border-0 align-top">
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <TypeBadge type={e.type} />
                </td>
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{e.userName ?? "Anonymous"}</td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{e.path ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{e.detail ?? "—"}</td>
              </tr>
            ))}
            {!loading && entries.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">No activity recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
