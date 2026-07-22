import NotificationBell from "./NotificationBell";

export default function Topbar({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-[0_1px_2px_rgba(15,23,42,0.03)] px-4 py-4 md:px-8 md:py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <NotificationBell />
        {action}
      </div>
    </div>
  );
}
