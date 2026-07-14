"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ArrowLeft, LogIn, Eye } from "lucide-react";

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
  type: "LOGIN" | "PUBLIC_VISIT";
  userName: string | null;
  path: string | null;
  detail: string | null;
  createdAt: string;
};
type Totals = { totalLogins: number; totalPublicVisits: number; usersWhoLoggedIn: number; totalUsers: number };

export default function UserActivityPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [recent, setRecent] = useState<ActivityEntry[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  return (
    <div>
      <Topbar
        title="User Activity"
        subtitle="Who's logging in, and who's opening public links (login page, marketing site, RFP invites)"
        action={
          <Link href="/admin" className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800">
            <ArrowLeft size={14} /> Back to Admin
          </Link>
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Users who've logged in" value={totals ? `${totals.usersWhoLoggedIn} / ${totals.totalUsers}` : "—"} />
          <Stat label="Total logins" value={totals ? `${totals.totalLogins}` : "—"} />
          <Stat label="Public link visits" value={totals ? `${totals.totalPublicVisits}` : "—"} />
          <Stat label="Tracked events" value={totals ? `${totals.totalLogins + totals.totalPublicVisits}` : "—"} />
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Users</p>
            <p className="text-xs text-slate-400">Sorted by most recent login first; users who&apos;ve never logged in sort last.</p>
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
                  <tr key={u.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
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

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900">Recent activity</p>
            <p className="text-xs text-slate-400">Most recent 200 events — logins and public-link visits.</p>
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
                {recent.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 last:border-0 align-top">
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 ${
                          e.type === "LOGIN" ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {e.type === "LOGIN" ? <LogIn size={11} /> : <Eye size={11} />}
                        {e.type === "LOGIN" ? "Login" : "Visit"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{e.userName ?? "Anonymous"}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{e.path ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{e.detail ?? "—"}</td>
                  </tr>
                ))}
                {!loading && recent.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-400">No activity recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
