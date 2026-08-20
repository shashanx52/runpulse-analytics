// The derivation engine. Every tab calls into here; none of them does its own arithmetic.
//
// Two invariants worth stating, because breaking either produces numbers that look
// plausible and are wrong:
//
//   1. Ratios are computed from summed numerators and denominators, never averaged from
//      per-day ratios. The mean of daily conversion rates is not the conversion rate.
//   2. Dates are ISO (YYYY-MM-DD) everywhere, so string comparison is date comparison.
//      The generator writes ISO and the loaders normalise to ISO on the way in. Nothing
//      downstream may reformat a date until it reaches a formatter.

import { CITY_LEVELS } from "./constants";
import type { DailyRow, Derived, EntityRow, MoverRow, Row, Totals, Flag } from "./types";

// ---------------------------------------------------------------------------
// dates
// ---------------------------------------------------------------------------
const MS = 86400000;

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / MS);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to || from > to) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function dayOfWeek(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}

export const filterDates = (rows: Row[], start: string, end: string): Row[] =>
  rows.filter((r) => r.c_date >= start && r.c_date <= end);

// ---------------------------------------------------------------------------
// totals and ratios
// ---------------------------------------------------------------------------
export const ZERO: Totals = {
  landed: 0,
  lead_submitted: 0,
  pay_now_attempt: 0,
  conversions: 0,
  gtv: 0,
  spend: 0,
};

export function sumTotals(rows: Row[]): Totals {
  const t: Totals = { ...ZERO };
  for (const r of rows) {
    t.landed += r.landed;
    t.lead_submitted += r.lead_submitted;
    t.pay_now_attempt += r.pay_now_attempt;
    t.conversions += r.conversions;
    t.gtv += r.gtv;
    t.spend += r.spend;
  }
  return t;
}

const pctOf = (num: number, den: number): number | null => (den > 0 ? (num / den) * 100 : null);
const divOf = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/** attach every ratio to a set of totals */
export function derive(t: Totals): Derived {
  return {
    ...t,
    L2L: pctOf(t.lead_submitted, t.landed),
    L2P: pctOf(t.pay_now_attempt, t.lead_submitted),
    P2C: pctOf(t.conversions, t.pay_now_attempt),
    L2C: pctOf(t.conversions, t.landed),
    ROAS: divOf(t.gtv, t.spend),
    CPL: divOf(t.spend, t.lead_submitted),
    CPA: divOf(t.spend, t.conversions),
    AOV: divOf(t.gtv, t.conversions),
  };
}

export const totalsFor = (rows: Row[]): Derived => derive(sumTotals(rows));

// ---------------------------------------------------------------------------
// slicing
// ---------------------------------------------------------------------------
/**
 * Rows at one level, optionally narrowed to a city.
 *
 * The city filter is the subtle part. A level that carries its own city
 * (channel_city, meta_campaign_city, ...) filters on the parsed `_city`. A level that
 * does not — `channel`, `meta_campaign` — has no city dimension at all, so filtering it
 * by city would silently return nothing. In that case we fall back to the matching
 * *_city level and re-aggregate to the parent entity, which is what the reader means.
 */
export function atLevel(rows: Row[], level: string, city?: string | null): Row[] {
  const base = rows.filter((r) => r.level === level);
  if (!city) return base;
  if (CITY_LEVELS.includes(level)) return base.filter((r) => r._city === city);

  const cityLevel = `${level}_city`;
  const viaCity = rows.filter((r) => r.level === cityLevel && r._city === city);
  if (!viaCity.length) return base.filter(() => false);
  // re-key onto the parent entity so callers see the level they asked for
  const byKey = new Map<string, Row>();
  for (const r of viaCity) {
    const k = `${r.c_date}|${r.parent}`;
    let o = byKey.get(k);
    if (!o) {
      o = { ...r, level, entity: r.parent, parent: "", _city: city };
      o.landed = 0;
      o.lead_submitted = 0;
      o.pay_now_attempt = 0;
      o.conversions = 0;
      o.gtv = 0;
      o.spend = 0;
      byKey.set(k, o);
    }
    o.landed += r.landed;
    o.lead_submitted += r.lead_submitted;
    o.pay_now_attempt += r.pay_now_attempt;
    o.conversions += r.conversions;
    o.gtv += r.gtv;
    o.spend += r.spend;
  }
  return [...byKey.values()];
}

/** one row per day, ratios derived from the day's sums */
export function daily(rows: Row[]): DailyRow[] {
  const by = new Map<string, Totals>();
  for (const r of rows) {
    let t = by.get(r.c_date);
    if (!t) {
      t = { ...ZERO };
      by.set(r.c_date, t);
    }
    t.landed += r.landed;
    t.lead_submitted += r.lead_submitted;
    t.pay_now_attempt += r.pay_now_attempt;
    t.conversions += r.conversions;
    t.gtv += r.gtv;
    t.spend += r.spend;
  }
  return [...by.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([c_date, t]) => ({ c_date, ...derive(t) }));
}

/** one row per entity, sorted by a chosen column descending */
export function byEntity(rows: Row[], sortBy: keyof Derived = "gtv"): EntityRow[] {
  const by = new Map<string, { t: Totals; parent: string; channel: string }>();
  for (const r of rows) {
    let o = by.get(r.entity);
    if (!o) {
      o = { t: { ...ZERO }, parent: r.parent, channel: r.channel };
      by.set(r.entity, o);
    }
    o.t.landed += r.landed;
    o.t.lead_submitted += r.lead_submitted;
    o.t.pay_now_attempt += r.pay_now_attempt;
    o.t.conversions += r.conversions;
    o.t.gtv += r.gtv;
    o.t.spend += r.spend;
  }
  return [...by.entries()]
    .map(([entity, o]) => ({ entity, parent: o.parent, channel: o.channel, ...derive(o.t) }))
    .sort((a, b) => {
      const av = a[sortBy] ?? -Infinity;
      const bv = b[sortBy] ?? -Infinity;
      return (bv as number) - (av as number);
    });
}

/** group by an arbitrary key extracted from each row */
export function groupBy(rows: Row[], key: (r: Row) => string): Map<string, Derived> {
  const by = new Map<string, Totals>();
  for (const r of rows) {
    const k = key(r);
    let t = by.get(k);
    if (!t) {
      t = { ...ZERO };
      by.set(k, t);
    }
    t.landed += r.landed;
    t.lead_submitted += r.lead_submitted;
    t.pay_now_attempt += r.pay_now_attempt;
    t.conversions += r.conversions;
    t.gtv += r.gtv;
    t.spend += r.spend;
  }
  const out = new Map<string, Derived>();
  for (const [k, t] of by) out.set(k, derive(t));
  return out;
}

// ---------------------------------------------------------------------------
// comparison
// ---------------------------------------------------------------------------
/** the equally long window immediately before [start, end] */
export function priorWindow(start: string, end: string): { start: string; end: string } {
  const n = daysBetween(start, end) + 1;
  return { start: addDays(start, -n), end: addDays(start, -1) };
}

export function pctChange(cur: number, base: number): number | null {
  if (!isFinite(cur) || !isFinite(base)) return null;
  if (base === 0) return cur === 0 ? 0 : null; // no honest percentage off a zero base
  return ((cur - base) / Math.abs(base)) * 100;
}

function flagFor(cur: number, base: number): Flag {
  if (base === 0 && cur === 0) return "NA";
  if (base > 0 && cur === 0) return "DEAD";
  const p = pctChange(cur, base);
  if (p == null) return "NA";
  if (p <= -50) return "DOWN_BIG";
  if (p <= -12) return "DOWN";
  if (p >= 12) return "UP";
  return "FLAT";
}

/**
 * Biggest movers on one metric between two row sets, ranked by absolute change rather
 * than percentage — a 400% jump on 2 registrations is noise, and ranking by percentage
 * puts it at the top every time.
 */
export function movers(
  cur: Row[],
  base: Row[],
  metric: keyof Totals = "conversions",
  level = ""
): MoverRow[] {
  const c = groupBy(cur, (r) => r.entity);
  const b = groupBy(base, (r) => r.entity);
  const keys = new Set([...c.keys(), ...b.keys()]);
  const out: MoverRow[] = [];
  for (const k of keys) {
    const cv = (c.get(k)?.[metric] as number) ?? 0;
    const bv = (b.get(k)?.[metric] as number) ?? 0;
    if (cv === 0 && bv === 0) continue;
    out.push({
      entity: k,
      level,
      cur: cv,
      base: bv,
      delta: cv - bv,
      pct: pctChange(cv, bv),
      flag: flagFor(cv, bv),
    });
  }
  return out.sort((a, b2) => Math.abs(b2.delta) - Math.abs(a.delta));
}

// ---------------------------------------------------------------------------
// series helpers used by charts and the forecast tab
// ---------------------------------------------------------------------------
/** centred rolling mean; the window shrinks at the edges rather than emitting nulls */
export function rollingMean(vals: number[], win = 7): number[] {
  const half = Math.floor(win / 2);
  return vals.map((_, i) => {
    const lo = Math.max(0, i - half);
    const hi = Math.min(vals.length - 1, i + half);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += vals[j];
    return s / (hi - lo + 1);
  });
}

export function median(vals: number[]): number {
  if (!vals.length) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Robust z-score on the median absolute deviation. Used instead of a mean/σ z-score
 * because a spike inflates σ enough to hide itself — the exact failure that lets a bot
 * spike sit in a dataset for weeks.
 */
export function madZ(vals: number[]): number[] {
  const med = median(vals);
  const mad = median(vals.map((v) => Math.abs(v - med)));
  const denom = mad === 0 ? 1e-9 : mad * 1.4826;
  return vals.map((v) => (v - med) / denom);
}

export function cumulative(vals: number[]): number[] {
  let s = 0;
  return vals.map((v) => (s += v));
}

/** share of total, as percentages summing to 100 */
export function shares(vals: number[]): number[] {
  const t = vals.reduce((a, b) => a + b, 0);
  return t > 0 ? vals.map((v) => (v / t) * 100) : vals.map(() => 0);
}
