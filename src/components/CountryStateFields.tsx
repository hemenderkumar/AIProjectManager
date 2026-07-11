"use client";
import { COUNTRIES, statesForCountry } from "@/lib/geo";

// Paired Country / State-Province dropdowns for the project form — State/Province options
// depend on the chosen Country (falls back to a disabled "not applicable" option for
// countries we don't have a state list for, rather than blocking data entry).
export default function CountryStateFields({
  country,
  stateProvince,
  onCountryChange,
  onStateChange,
  selectCls,
}: {
  country: string;
  stateProvince: string;
  onCountryChange: (value: string) => void;
  onStateChange: (value: string) => void;
  selectCls: string;
}) {
  const states = statesForCountry(country);
  return (
    <>
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">Country</span>
        <select
          value={country}
          onChange={(e) => {
            onCountryChange(e.target.value);
            onStateChange("");
          }}
          className={selectCls}
        >
          <option value="">— Select a country —</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">State / Province</span>
        <select
          value={stateProvince}
          onChange={(e) => onStateChange(e.target.value)}
          disabled={states.length === 0}
          className={`${selectCls} disabled:opacity-50 disabled:bg-slate-50`}
        >
          <option value="">{states.length ? "— Select a state/province —" : "— Not applicable —"}</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
    </>
  );
}
