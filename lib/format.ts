// Indian-numbering formatters. Every number the UI shows goes through one of these,
// so lakh/crore rounding is consistent and "—" always means "no data" rather than 0.

export function fmtNum(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function fmtInr(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function fmtInrFull(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

export function fmtInt(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return Math.round(v).toLocaleString("en-IN");
}

export function fmtPct(v: number | null | undefined, dp = 1): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(dp)}%`;
}

export function fmtRatio(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(2)}×`;
}

/** signed percentage, for deltas */
export function fmtDelta(v: number | null | undefined, dp = 1): string {
  if (v == null || !isFinite(v)) return "—";
  const s = v > 0 ? "+" : "";
  return `${s}${v.toFixed(dp)}%`;
}

export function fmtByUnit(v: number | null | undefined, unit: string): string {
  switch (unit) {
    case "rupee":
      return fmtInr(v);
    case "pct":
      return fmtPct(v);
    case "ratio":
      return fmtRatio(v);
    default:
      return fmtNum(v);
  }
}

/** 2026-08-19 -> "19 Aug" ; used on every axis so ticks stay narrow */
export function fmtDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]}`;
}

export function fmtDayFull(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  return `${fmtDay(iso)} ${m[1]}`;
}

export function fmtCell(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") {
    if (!isFinite(v)) return "—";
    return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  return String(v);
}

/** turns vrs26_meta_prospect_broad_natl into something a human can scan */
export function prettyCampaign(name: string): string {
  return (name || "")
    .replace(/^vrs26_/, "")
    .replace(/__as_/, " · ")
    .replace(/_/g, " ");
}
