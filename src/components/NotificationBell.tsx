"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check } from "lucide-react";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

// Global notification bell (#262) -- rendered once, inside Topbar, so every page in the app
// shell gets it without each page having to wire it in individually. Polls rather than a
// websocket/SSE connection: simplest thing that works for a bell badge, and consistent with
// the rest of this app's "no long-lived connections" architecture.
export default function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch("/api/notifications");
    if (res.ok) setItems(await res.json());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const interval = setInterval(load, 45000);
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      clearInterval(interval);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, []);

  const unreadCount = items.filter((n) => !n.readAt).length;

  async function markRead(id: string) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    });
  }

  async function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    await fetch("/api/notifications/mark-all-read", { method: "POST" });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-700">Notifications</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-medium">
                <Check size={12} /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">You&apos;re all caught up.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {items.map((n) => {
                const content = (
                  <div
                    className={`px-3 py-2.5 text-xs cursor-pointer hover:bg-slate-50 ${!n.readAt ? "bg-accent-50/40" : ""}`}
                    onClick={() => !n.readAt && markRead(n.id)}
                  >
                    <p className={`font-medium ${!n.readAt ? "text-slate-900" : "text-slate-600"}`}>{n.title}</p>
                    {n.body && <p className="text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-slate-300 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
                  </div>
                );
                return n.link ? (
                  <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
