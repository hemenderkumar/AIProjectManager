"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, FileText, ListChecks, Package, AlertTriangle } from "lucide-react";

type SearchResult = {
  type: "project" | "task" | "deliverable" | "risk";
  id: string;
  projectId: string;
  title: string;
  snippet: string | null;
  rank: number;
};

const ICONS: Record<SearchResult["type"], React.ElementType> = {
  project: FileText,
  task: ListChecks,
  deliverable: Package,
  risk: AlertTriangle,
};

// Command-palette style global search (cmd+K / ctrl+K), mounted once in AppShell so it's
// available on every authenticated page. Debounced query against /api/search, which is
// itself scoped to whatever projects the signed-in user can already see — nothing here
// widens visibility, it just makes what's already visible findable in one keystroke.
export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const closePalette = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") closePalette();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closePalette]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const go = useCallback(
    (r: SearchResult) => {
      closePalette();
      router.push(`/projects/${r.projectId}`);
    },
    [router, closePalette]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-slate-900/40" onClick={closePalette}>
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, tasks, deliverables, risks…"
            className="flex-1 outline-none text-sm text-slate-900 placeholder:text-slate-400"
          />
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close search">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && <p className="px-4 py-6 text-sm text-slate-400 text-center">Searching…</p>}
          {!loading && query.trim() && results.length === 0 && (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">No results for &ldquo;{query}&rdquo;</p>
          )}
          {!loading &&
            results.map((r) => {
              const Icon = ICONS[r.type];
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => go(r)}
                  className="w-full flex items-start gap-2.5 px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0"
                >
                  <Icon size={15} className="mt-0.5 text-slate-400 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm text-slate-900 truncate">{r.title}</span>
                    <span className="block text-xs text-slate-400 uppercase tracking-wide">{r.type}</span>
                  </span>
                </button>
              );
            })}
        </div>
        {!query.trim() && (
          <p className="px-4 py-2.5 text-xs text-slate-400 border-t border-slate-100">
            Press <kbd className="px-1 py-0.5 bg-slate-100 rounded">Esc</kbd> to close
          </p>
        )}
      </div>
    </div>
  );
}
