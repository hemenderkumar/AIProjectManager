"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import { ShieldCheck, Star, Search, X } from "lucide-react";

type Vendor = {
  id: string;
  name: string;
  headline: string | null;
  categories: string[] | null;
  skills: string[] | null;
  priceBandMin: number | null;
  priceBandMax: number | null;
  primaryCountry: string | null;
  verificationStatus: string;
  rating: { avgRating: number; reviewCount: number } | null;
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-500";
const emptyFilters = { q: "", category: "", skill: "", minPrice: "", maxPrice: "", minRating: "", verifiedOnly: false };

export default function VendorDirectoryPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(emptyFilters);

  async function load(f: typeof emptyFilters = filters) {
    setLoading(true);
    const params = new URLSearchParams();
    if (f.q.trim()) params.set("q", f.q.trim());
    if (f.category.trim()) params.set("category", f.category.trim());
    if (f.skill.trim()) params.set("skill", f.skill.trim());
    if (f.minPrice) params.set("minPrice", f.minPrice);
    if (f.maxPrice) params.set("maxPrice", f.maxPrice);
    if (f.minRating) params.set("minRating", f.minRating);
    if (f.verifiedOnly) params.set("verifiedOnly", "true");
    const qs = params.toString();
    const res = await fetch(`/api/keelconnect/vendors${qs ? `?${qs}` : ""}`);
    if (res.ok) setVendors(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(emptyFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeFilterCount = Object.values(filters).filter((v) => (typeof v === "boolean" ? v : Boolean(v))).length;

  return (
    <div>
      <Topbar title="Vendor Directory" subtitle="Search and filter verified outsourcing partners on KeelConnect" />
      <div className="p-8 max-w-4xl space-y-6">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-3">
            <input placeholder="Search name or headline" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} className={inputCls} />
            <input placeholder="Category" value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} className={inputCls} />
            <input placeholder="Skill" value={filters.skill} onChange={(e) => setFilters((f) => ({ ...f, skill: e.target.value }))} className={inputCls} />
            <input placeholder="Min $/hr" type="number" value={filters.minPrice} onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))} className={inputCls} />
            <input placeholder="Max $/hr" type="number" value={filters.maxPrice} onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))} className={inputCls} />
            <select value={filters.minRating} onChange={(e) => setFilters((f) => ({ ...f, minRating: e.target.value }))} className={inputCls}>
              <option value="">Any rating</option>
              <option value="4">4+ stars</option>
              <option value="3">3+ stars</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-600 font-medium">
              <input type="checkbox" checked={filters.verifiedOnly} onChange={(e) => setFilters((f) => ({ ...f, verifiedOnly: e.target.checked }))} />
              Verified vendors only
            </label>
            <div className="flex gap-2">
              <button onClick={() => load(filters)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-700">
                <Search size={13} /> Search
              </button>
              {activeFilterCount > 0 && (
                <button
                  onClick={() => {
                    setFilters(emptyFilters);
                    load(emptyFilters);
                  }}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  <X size={13} /> Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-5">
          <p className="text-sm font-semibold text-slate-900 mb-3">Vendors</p>
          {loading ? (
            <p className="text-xs text-slate-400">Searching...</p>
          ) : vendors.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No vendors match this search.</p>
          ) : (
            <div className="space-y-2">
              {vendors.map((v) => (
                <Link
                  key={v.id}
                  href={`/keelconnect/organizations/${v.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:border-accent-200 hover:bg-accent-50/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{v.name}</p>
                      {v.verificationStatus === "VERIFIED" && (
                        <span className="flex items-center gap-0.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          <ShieldCheck size={11} /> Verified
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{v.headline ?? "No headline set"}</p>
                    {(v.categories?.length || v.skills?.length) ? (
                      <p className="text-xs text-slate-400 mt-1">
                        {[...(v.categories ?? []), ...(v.skills ?? [])].slice(0, 5).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    {v.rating && (
                      <p className="flex items-center justify-end gap-1 text-sm font-medium text-slate-700">
                        <Star size={13} className="text-amber-400 fill-amber-400" /> {v.rating.avgRating.toFixed(1)}
                        <span className="text-xs text-slate-400 font-normal">({v.rating.reviewCount})</span>
                      </p>
                    )}
                    {(v.priceBandMin != null || v.priceBandMax != null) && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        ${v.priceBandMin ?? "?"}–${v.priceBandMax ?? "?"}/hr
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
