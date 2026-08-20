// Small helpers shared by the tab components. Nothing here is clever; it exists so
// thirteen tabs do not each reimplement "value, delta against the prior window, and the
// right colour direction" and drift apart in the process.

import { fmtByUnit } from "./format";
import { pctChange } from "./data";
import type { Derived, Dir, KpiItem, Row, Totals } from "./types";

export interface KpiSpec {
  label: string;
  /** which derived field to read */
  key: keyof Derived;
  unit: "count" | "rupee" | "pct" | "ratio";
  dir: Dir;
  note?: string;
}

/** Build KPI cards for a metric set, each with its change against a baseline window. */
export function buildKpis(cur: Derived, base: Derived | null, specs: KpiSpec[]): KpiItem[] {
  return specs.map((s) => {
    const c = cur[s.key] as number | null;
    const b = base ? (base[s.key] as number | null) : null;
    return {
      label: s.label,
      value: fmtByUnit(c, s.unit),
      delta: c != null && b != null ? pctChange(c, b) : null,
      dir: s.dir,
      sub: base ? "vs prior" : undefined,
      note: s.note,
    };
  });
}

/** Sum one numeric column over rows. */
export const sumCol = (rows: Row[], k: keyof Totals): number =>
  rows.reduce((a, r) => a + (r[k] as number), 0);

/**
 * Blended vs paid-only ROAS.
 *
 * Worth separating everywhere it appears. Blended counts organic, email and referral
 * revenue against paid spend, which on a well-known event is most of the revenue and
 * makes any media buy look excellent. Paid-only answers the narrower question the money
 * is actually accountable for.
 */
export function roasSplit(
  channelRows: Row[],
  paidChannels: string[]
): { spend: number; blended: number | null; paidOnly: number | null } {
  const spend = sumCol(channelRows, "spend");
  const allGtv = sumCol(channelRows, "gtv");
  const paidGtv = channelRows.filter((r) => paidChannels.includes(r.channel)).reduce((a, r) => a + r.gtv, 0);
  return {
    spend,
    blended: spend > 0 ? allGtv / spend : null,
    paidOnly: spend > 0 ? paidGtv / spend : null,
  };
}

/** Aggregate detail-table rows (Meta/Google/LinkedIn/Print) by a key. */
export interface DetailAgg {
  key: string;
  spend: number;
  impressions: number;
  clicks: number;
  landed: number;
  lead_submitted: number;
  pay_now_attempt: number;
  conversions: number;
  gtv: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  l2l: number | null;
  l2c: number | null;
  roas: number | null;
  cac: number | null;
  aov: number | null;
}

interface Detailish {
  spend: number;
  impressions?: number;
  clicks?: number;
  landed: number;
  lead_submitted: number;
  pay_now_attempt: number;
  conversions: number;
  gtv: number;
}

export function aggDetail<T extends Detailish>(rows: T[], key: (r: T) => string): DetailAgg[] {
  const by = new Map<string, DetailAgg>();
  for (const r of rows) {
    const k = key(r);
    let o = by.get(k);
    if (!o) {
      o = {
        key: k, spend: 0, impressions: 0, clicks: 0, landed: 0, lead_submitted: 0,
        pay_now_attempt: 0, conversions: 0, gtv: 0,
        ctr: null, cpc: null, cpm: null, l2l: null, l2c: null, roas: null, cac: null, aov: null,
      };
      by.set(k, o);
    }
    o.spend += r.spend;
    o.impressions += r.impressions ?? 0;
    o.clicks += r.clicks ?? 0;
    o.landed += r.landed;
    o.lead_submitted += r.lead_submitted;
    o.pay_now_attempt += r.pay_now_attempt;
    o.conversions += r.conversions;
    o.gtv += r.gtv;
  }
  const d = (n: number, den: number): number | null => (den > 0 ? n / den : null);
  for (const o of by.values()) {
    o.ctr = o.impressions > 0 ? (o.clicks / o.impressions) * 100 : null;
    o.cpc = d(o.spend, o.clicks);
    o.cpm = o.impressions > 0 ? (o.spend / o.impressions) * 1000 : null;
    o.l2l = o.landed > 0 ? (o.lead_submitted / o.landed) * 100 : null;
    o.l2c = o.landed > 0 ? (o.conversions / o.landed) * 100 : null;
    o.roas = d(o.gtv, o.spend);
    o.cac = d(o.spend, o.conversions);
    o.aov = d(o.gtv, o.conversions);
  }
  return [...by.values()].sort((a, b) => b.spend - a.spend);
}

/** Totals across an aggregated detail set, so the KPI row and the table agree. */
export function detailTotals(rows: DetailAgg[]): DetailAgg {
  const t: DetailAgg = {
    key: "all", spend: 0, impressions: 0, clicks: 0, landed: 0, lead_submitted: 0,
    pay_now_attempt: 0, conversions: 0, gtv: 0,
    ctr: null, cpc: null, cpm: null, l2l: null, l2c: null, roas: null, cac: null, aov: null,
  };
  for (const r of rows) {
    t.spend += r.spend;
    t.impressions += r.impressions;
    t.clicks += r.clicks;
    t.landed += r.landed;
    t.lead_submitted += r.lead_submitted;
    t.pay_now_attempt += r.pay_now_attempt;
    t.conversions += r.conversions;
    t.gtv += r.gtv;
  }
  const d = (n: number, den: number): number | null => (den > 0 ? n / den : null);
  t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null;
  t.cpc = d(t.spend, t.clicks);
  t.cpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null;
  t.l2l = t.landed > 0 ? (t.lead_submitted / t.landed) * 100 : null;
  t.l2c = t.landed > 0 ? (t.conversions / t.landed) * 100 : null;
  t.roas = d(t.gtv, t.spend);
  t.cac = d(t.spend, t.conversions);
  t.aov = d(t.gtv, t.conversions);
  return t;
}

/** Contiguous runs of dates in a sorted unique list — used to detect campaign flights. */
export function flights(dates: string[], gapDays = 3): { from: string; to: string; days: number }[] {
  if (!dates.length) return [];
  const ms = 86400000;
  const d = [...new Set(dates)].sort();
  const out: { from: string; to: string; days: number }[] = [];
  let from = d[0];
  let prev = d[0];
  for (let i = 1; i < d.length; i++) {
    const gap = (new Date(d[i] + "T00:00:00Z").getTime() - new Date(prev + "T00:00:00Z").getTime()) / ms;
    if (gap > gapDays) {
      out.push({ from, to: prev, days: Math.round((new Date(prev + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / ms) + 1 });
      from = d[i];
    }
    prev = d[i];
  }
  out.push({ from, to: prev, days: Math.round((new Date(prev + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / ms) + 1 });
  return out;
}
