"use client";
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { Download, AlertTriangle, Loader2 } from "lucide-react";

type Organization = {
  id: string;
  name: string;
  createdAt: string;
  deletionRequestedAt: string | null;
  deletionRequestedBy: string | null;
};

export default function OrganizationPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/organization");
    if (res.ok) setOrg(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch("/api/organization/export");
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(org?.name ?? "organization").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function requestDeletion() {
    setRequesting(true);
    setError(null);
    const res = await fetch("/api/organization/request-deletion", { method: "POST" });
    setRequesting(false);
    setShowConfirm(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data?.error ?? "Could not submit deletion request.");
      return;
    }
    load();
  }

  async function cancelDeletion() {
    setRequesting(true);
    await fetch("/api/organization/request-deletion", { method: "DELETE" });
    setRequesting(false);
    load();
  }

  if (loading) {
    return (
      <div>
        <Topbar title="My Organization" subtitle="Your company's data — export or request deletion" />
        <div className="p-8 text-sm text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!org) {
    return (
      <div>
        <Topbar title="My Organization" subtitle="Your company's data — export or request deletion" />
        <div className="p-8 text-sm text-slate-400">
          This page is only available to a company account owner (SUPER_USER).
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar title="My Organization" subtitle={org.name} />
      <div className="p-8 max-w-2xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-1">Export your data</p>
          <p className="text-xs text-slate-500 mb-4">
            Download every project, task, and record tied to {org.name} as a single JSON file.
          </p>
          <button
            onClick={exportData}
            disabled={exporting}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {exporting ? "Preparing export..." : "Export my organization's data (JSON)"}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-rose-200 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-1">Delete your organization&apos;s data</p>
          <p className="text-xs text-slate-500 mb-4">
            This permanently deletes every project, task, and record tied to {org.name}, and removes all
            of your organization&apos;s user accounts. It does not happen immediately — a Keel administrator
            reviews and confirms the request before anything is deleted, so there&apos;s no accidental loss.
          </p>

          {org.deletionRequestedAt ? (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-amber-900 font-medium">
                  Deletion requested {new Date(org.deletionRequestedAt).toLocaleString()}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Requested by {org.deletionRequestedBy}. Pending admin review — nothing has been deleted yet.
                </p>
                <button
                  onClick={cancelDeletion}
                  disabled={requesting}
                  className="mt-2 text-xs font-medium text-amber-900 underline hover:no-underline disabled:opacity-50"
                >
                  Cancel this request
                </button>
              </div>
            </div>
          ) : showConfirm ? (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-2">
              <p className="text-xs text-rose-900">
                Are you sure? This will ask an administrator to permanently delete all of {org.name}&apos;s
                data. This cannot be undone once confirmed.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={requestDeletion}
                  disabled={requesting}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 disabled:opacity-50"
                >
                  {requesting ? "Submitting..." : "Yes, request deletion"}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="px-3.5 py-2 rounded-lg border border-rose-300 text-rose-600 text-sm font-medium hover:bg-rose-50"
            >
              Request deletion of our data
            </button>
          )}
          {error && <p className="text-xs text-rose-600 mt-2">{error}</p>}
        </div>
      </div>
    </div>
  );
}
