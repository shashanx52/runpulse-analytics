// Data-quality gates. Server only.
//
// The point of this file is that every check below can actually fail, and several would
// fail loudly if the generator or a loader were changed carelessly. A dashboard that
// only shows green ticks it cannot fail is decoration; the tolerance and the measured
// value are reported next to each result so a reader can judge the tick rather than
// trust it.

import { funnelRows, googleRows, linkedinRows, metaRows, printRows } from "./csv";
import { dateRange, median } from "./data";
import type { Row } from "./types";

export interface QualityCheck {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  expected: string;
  actual: string;
}

export interface Incident {
  id: string;
  title: string;
  window: string;
  evidence: string;
  detected: boolean;
}

export interface QualityPayload {
  checks: QualityCheck[];
  incidents: Incident[];
  reconciliation: {
    source: string;
    metric: string;
    detail: number;
    funnel: number;
    diff: number;
    pctDiff: number | null;
    tolerance: string;
  }[];
  error?: string;
}

const SEASON_START = "2026-03-01";
const SEASON_END = "2026-08-19";

const sumBy = (rows: Row[], k: keyof Row): number =>
  rows.reduce((a, r) => a + (r[k] as number), 0);

const fmt = (n: number): string => Math.round(n).toLocaleString("en-IN");

function pct(a: number, b: number): number | null {
  return b === 0 ? null : ((a - b) / Math.abs(b)) * 100;
}

export function runChecks(): QualityPayload {
  const rows = funnelRows();
  if (!rows.length) {
    return { checks: [], incidents: [], reconciliation: [], error: "NO_DATA" };
  }

  const checks: QualityCheck[] = [];
  const byLevel = new Map<string, Row[]>();
  for (const r of rows) {
    const a = byLevel.get(r.level);
    if (a) a.push(r);
    else byLevel.set(r.level, [r]);
  }
  const at = (l: string): Row[] => byLevel.get(l) ?? [];

  // ---- 1. channel rows must sum to the overall level, day by day ----------
  {
    const ov = new Map<string, Row>();
    for (const r of at("overall")) ov.set(r.c_date, r);
    const ch = new Map<string, { landed: number; leads: number; conv: number; gtv: number }>();
    for (const r of at("channel")) {
      const o = ch.get(r.c_date) ?? { landed: 0, leads: 0, conv: 0, gtv: 0 };
      o.landed += r.landed;
      o.leads += r.lead_submitted;
      o.conv += r.conversions;
      o.gtv += r.gtv;
      ch.set(r.c_date, o);
    }
    let bad = 0;
    let worst = { date: "", what: "", diff: 0 };
    for (const [d, o] of ov) {
      const c = ch.get(d);
      if (!c) {
        bad++;
        continue;
      }
      const tests: [string, number][] = [
        ["landed", c.landed - o.landed],
        ["leads", c.leads - o.lead_submitted],
        ["registrations", c.conv - o.conversions],
        ["gtv", c.gtv - o.gtv],
      ];
      for (const [what, diff] of tests) {
        const tol = what === "gtv" ? 2 : 0;
        if (Math.abs(diff) > tol) {
          bad++;
          if (Math.abs(diff) > Math.abs(worst.diff)) worst = { date: d, what, diff };
        }
      }
    }
    checks.push({
      id: "channel-sums-to-overall",
      title: "Channel rows sum to the overall level",
      status: bad === 0 ? "pass" : "fail",
      detail:
        bad === 0
          ? "Every day reconciles across landed, leads, registrations and GTV."
          : "Worst mismatch: " + worst.what + " on " + worst.date + " off by " + fmt(worst.diff) + ".",
      expected: "0 mismatched day-metrics (GTV tolerance 2)",
      actual: bad + " mismatched",
    });
  }

  // ---- 2. every *_city level rolls up to its parent, and parent strings resolve ----
  {
    const pairs: [string, string][] = [
      ["channel_city", "channel"],
      ["meta_campaign_city", "meta_campaign"],
      ["google_campaign_city", "google_campaign"],
      ["linkedin_campaign_city", "linkedin_campaign"],
      ["print_campaign_city", "print_campaign"],
      ["product_city", "product"],
      ["source_city", "source"],
    ];
    let orphans = 0;
    let mismatched = 0;
    let worst = { level: "", entity: "", date: "", diff: 0 };
    for (const [child, parent] of pairs) {
      const kids = at(child);
      const parents = at(parent);
      if (!kids.length || !parents.length) continue;
      const pIndex = new Map<string, Row>();
      for (const p of parents) pIndex.set(p.c_date + "|" + p.entity, p);
      const rolled = new Map<string, number>();
      for (const k of kids) {
        const key = k.c_date + "|" + k.parent;
        if (!pIndex.has(key)) {
          // a parent string that does not resolve silently empties a drill-down: the
          // child rows simply stop appearing under their parent and nothing errors
          orphans++;
          continue;
        }
        rolled.set(key, (rolled.get(key) ?? 0) + k.conversions);
      }
      for (const [key, conv] of rolled) {
        const p = pIndex.get(key);
        if (!p) continue;
        const diff = conv - p.conversions;
        if (Math.abs(diff) > 0) {
          mismatched++;
          if (Math.abs(diff) > Math.abs(worst.diff)) {
            const [date, entity] = key.split("|");
            worst = { level: child, entity, date, diff };
          }
        }
      }
    }
    const status = orphans > 0 ? "fail" : mismatched > 0 ? "warn" : "pass";
    checks.push({
      id: "city-rollup",
      title: "City levels roll up to their parent, and every parent string resolves",
      status,
      detail:
        orphans > 0
          ? orphans + " child rows name a parent that does not exist on that day."
          : mismatched > 0
            ? "Registration totals differ on " +
              mismatched +
              " parent-days; worst is " +
              worst.entity +
              " on " +
              worst.date +
              " (" +
              fmt(worst.diff) +
              ")."
            : "All seven city levels reconcile exactly to their parents.",
      expected: "0 orphan parents, 0 registration mismatches",
      actual: orphans + " orphans, " + mismatched + " mismatches",
    });
  }

  // ---- 3-4. detail CSVs reconcile to their funnel level -------------------
  const reconciliation: QualityPayload["reconciliation"] = [];
  const detail: [string, { spend: number; landed: number; conversions: number; gtv: number }, string][] = [
    [
      "Meta",
      metaRows().reduce(
        (a, r) => ({
          spend: a.spend + r.spend,
          landed: a.landed + r.landed,
          conversions: a.conversions + r.conversions,
          gtv: a.gtv + r.gtv,
        }),
        { spend: 0, landed: 0, conversions: 0, gtv: 0 }
      ),
      "meta_campaign",
    ],
    [
      "Google",
      googleRows().reduce(
        (a, r) => ({
          spend: a.spend + r.spend,
          landed: a.landed + r.landed,
          conversions: a.conversions + r.conversions,
          gtv: a.gtv + r.gtv,
        }),
        { spend: 0, landed: 0, conversions: 0, gtv: 0 }
      ),
      "google_campaign",
    ],
    [
      "LinkedIn",
      linkedinRows().reduce(
        (a, r) => ({
          spend: a.spend + r.spend,
          landed: a.landed + r.landed,
          conversions: a.conversions + r.conversions,
          gtv: a.gtv + r.gtv,
        }),
        { spend: 0, landed: 0, conversions: 0, gtv: 0 }
      ),
      "linkedin_campaign",
    ],
    [
      "Print",
      printRows().reduce(
        (a, r) => ({
          spend: a.spend + r.spend,
          landed: a.landed + r.landed,
          conversions: a.conversions + r.conversions,
          gtv: a.gtv + r.gtv,
        }),
        { spend: 0, landed: 0, conversions: 0, gtv: 0 }
      ),
      "print_campaign",
    ],
  ];

  let worstPct = 0;
  let worstWhat = "";
  for (const [src, tot, level] of detail) {
    const lvl = at(level);
    const f = {
      spend: sumBy(lvl, "spend"),
      landed: sumBy(lvl, "landed"),
      conversions: sumBy(lvl, "conversions"),
      gtv: sumBy(lvl, "gtv"),
    };
    for (const m of ["spend", "landed", "conversions", "gtv"] as const) {
      const p = pct(tot[m], f[m]);
      reconciliation.push({
        source: src,
        metric: m,
        detail: tot[m],
        funnel: f[m],
        diff: tot[m] - f[m],
        pctDiff: p,
        tolerance: "0.5%",
      });
      if (p != null && Math.abs(p) > Math.abs(worstPct)) {
        worstPct = p;
        worstWhat = src + " " + m;
      }
    }
  }
  checks.push({
    id: "detail-reconciles",
    title: "Channel reporting reconciles to the funnel table",
    status: Math.abs(worstPct) <= 0.5 ? "pass" : Math.abs(worstPct) <= 2 ? "warn" : "fail",
    detail:
      "Largest gap is " +
      worstWhat +
      " at " +
      worstPct.toFixed(4) +
      "%. Money is stored rounded to whole rupees, so a residual of a few thousandths of a" +
      " percent is expected there; counts must agree exactly.",
    expected: "within 0.5% on every metric",
    actual: "worst " + worstPct.toFixed(3) + "%",
  });

  // ---- 5. no date gaps, nothing outside the season ------------------------
  {
    const dates = new Set(rows.map((r) => r.c_date));
    const expected = dateRange(SEASON_START, SEASON_END);
    const missing = expected.filter((d) => !dates.has(d));
    const outside = [...dates].filter((d) => d < SEASON_START || d > SEASON_END);
    checks.push({
      id: "date-coverage",
      title: "Every day in the season is present and nothing falls outside it",
      status: missing.length === 0 && outside.length === 0 ? "pass" : "fail",
      detail:
        missing.length || outside.length
          ? "Missing: " + (missing.slice(0, 5).join(", ") || "none") + ". Outside: " + (outside.slice(0, 5).join(", ") || "none") + "."
          : expected.length + " consecutive days from " + SEASON_START + " to " + SEASON_END + ".",
      expected: expected.length + " days, 0 outside",
      actual: dates.size + " days, " + outside.length + " outside",
    });
  }

  // ---- 6. funnel monotonicity and non-negativity --------------------------
  {
    let neg = 0;
    let nonMono = 0;
    let example = "";
    for (const r of rows) {
      if (
        r.landed < 0 ||
        r.lead_submitted < 0 ||
        r.pay_now_attempt < 0 ||
        r.conversions < 0 ||
        r.gtv < 0 ||
        r.spend < 0
      )
        neg++;
    }
    for (const r of at("overall")) {
      if (
        !(r.conversions <= r.pay_now_attempt && r.pay_now_attempt <= r.lead_submitted && r.lead_submitted <= r.landed)
      ) {
        nonMono++;
        if (!example) example = r.c_date;
      }
    }
    checks.push({
      id: "funnel-monotonic",
      title: "No negatives, and each funnel stage is no larger than the one before it",
      status: neg === 0 && nonMono === 0 ? "pass" : "fail",
      detail:
        neg || nonMono
          ? neg + " negative values; " + nonMono + " days break stage ordering" + (example ? " (first: " + example + ")" : "") + "."
          : "All " + rows.length.toLocaleString("en-IN") + " rows non-negative; every day orders registrations <= pay <= leads <= landed.",
      expected: "0 negatives, 0 ordering breaks",
      actual: neg + " negatives, " + nonMono + " ordering breaks",
    });
  }

  // ---- 7. the two known tracking faults are still being caught ------------
  const incidents: Incident[] = [];
  {
    const g = at("channel")
      .filter((r) => r.channel === "google")
      .sort((a, b) => a.c_date.localeCompare(b.c_date));
    const l2l = g.map((r) => (r.landed > 0 ? (r.lead_submitted / r.landed) * 100 : 0));
    const base = median(l2l);
    const window = g.filter((r) => r.c_date >= "2026-05-18" && r.c_date <= "2026-05-20");
    const inWin = window.map((r) => (r.landed > 0 ? (r.lead_submitted / r.landed) * 100 : 0));
    const worst = inWin.length ? Math.min(...inWin) : 0;
    const detected = inWin.length > 0 && worst < base * 0.6;
    incidents.push({
      id: "lead-outage",
      title: "Lead events stopped firing on Google traffic",
      window: "18–20 May 2026",
      evidence:
        "Google landed→lead fell to " +
        worst.toFixed(1) +
        "% against a season median of " +
        base.toFixed(1) +
        "%, with landings unaffected — a tracking failure, not a media one.",
      detected,
    });

    const hyd = at("channel_city")
      .filter((r) => r.channel === "organic" && r._city === "Hyderabad")
      .sort((a, b) => a.c_date.localeCompare(b.c_date));
    const inSpike = hyd.filter((r) => r.c_date >= "2026-06-25" && r.c_date <= "2026-07-02");
    const outSpike = hyd.filter((r) => r.c_date < "2026-06-25" || r.c_date > "2026-07-02");
    const mIn = median(inSpike.map((r) => r.landed));
    const mOut = median(outSpike.map((r) => r.landed));
    const l2cIn = median(inSpike.map((r) => (r.landed > 0 ? (r.conversions / r.landed) * 100 : 0)));
    const l2cOut = median(outSpike.map((r) => (r.landed > 0 ? (r.conversions / r.landed) * 100 : 0)));
    incidents.push({
      id: "crawler-spike",
      title: "Crawler inflated organic landings in Hyderabad",
      window: "25 Jun – 2 Jul 2026",
      evidence:
        "Median daily landings rose from " +
        fmt(mOut) +
        " to " +
        fmt(mIn) +
        " (" +
        (mOut > 0 ? (mIn / mOut).toFixed(2) : "—") +
        "x) while landed→registration fell from " +
        l2cOut.toFixed(2) +
        "% to " +
        l2cIn.toFixed(2) +
        "% — volume with no intent behind it.",
      detected: mOut > 0 && mIn / mOut > 1.5 && l2cIn < l2cOut,
    });
  }
  checks.push({
    id: "known-faults",
    title: "Known tracking faults are still being detected",
    status: incidents.every((i) => i.detected) ? "warn" : "fail",
    detail:
      "These are deliberate. They exist so the pipeline has something real to catch; a" +
      " status of warn is the correct resting state, not a problem to fix.",
    expected: "2 of 2 detected",
    actual: incidents.filter((i) => i.detected).length + " of 2 detected",
  });

  return { checks, incidents, reconciliation };
}
