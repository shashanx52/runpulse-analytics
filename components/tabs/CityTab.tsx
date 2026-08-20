"use client";

import { useMemo } from "react";
import KpiCards from "@/components/KpiCards";
import SectionHeader from "@/components/SectionHeader";
import TrendChart from "@/components/TrendChart";
import DataTable, { type Col } from "@/components/DataTable";
import Callout from "@/components/Callout";
import FunnelChart from "@/components/FunnelChart";
import { useTheme } from "@/lib/theme";
import { atLevel, byEntity, daily, derive, filterDates, madZ, priorWindow, totalsFor } from "@/lib/data";
import { buildKpis } from "@/lib/tabkit";
import { CITY_ORDER, cityColor } from "@/lib/constants";
import { fmtDayFull, fmtInr, fmtInt, fmtPct, fmtRatio } from "@/lib/format";
import type { Derived, TabCtx } from "@/lib/types";

interface CityRow extends Derived {
  city: string;
  gtvShare: number;
}

export default function CityTab({ ctx }: { ctx: TabCtx }) {
  const { theme } = useTheme();

  const view = useMemo(() => {
    // channel_city carries both a city and spend, which the plain `city` level does not,
    // so every efficiency figure on this tab comes from there.
    const cc = atLevel(ctx.rows, "channel_city");
    const cities = [...new Set(cc.map((r) => r._city).filter((c): c is string => !!c))].sort(
      (a, b) => CITY_ORDER.indexOf(a) - CITY_ORDER.indexOf(b)
    );

    const totGtv = cc.reduce((a, r) => a + r.gtv, 0);
    const rows: CityRow[] = cities.map((c) => {
      const d = totalsFor(cc.filter((r) => r._city === c));
      return { ...d, city: c, gtvShare: totGtv > 0 ? (d.gtv / totGtv) * 100 : 0 };
    });

    const cur = totalsFor(ctx.city ? cc.filter((r) => r._city === ctx.city) : cc);
    const pw = priorWindow(ctx.start, ctx.end);
    const prev = atLevel(filterDates(ctx.rowsFull, pw.start, pw.end), "channel_city");
    const base = totalsFor(ctx.city ? prev.filter((r) => r._city === ctx.city) : prev);

    // stacked daily registrations per city
    const perDay = new Map<string, Record<string, number>>();
    for (const c of cities) {
      for (const d of daily(cc.filter((r) => r._city === c))) {
        const row = perDay.get(d.c_date) ?? {};
        row[c] = d.conversions;
        perDay.set(d.c_date, row);
      }
    }
    const series = [...perDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([c_date, r]) => ({ c_date, ...r }));

    // Per-city robust z on daily landings, so a city-local traffic spike surfaces here
    // rather than being averaged into the national trend.
    const spikes: { city: string; date: string; landed: number; z: number; l2c: number | null }[] = [];
    for (const c of cities) {
      const d = daily(cc.filter((r) => r._city === c));
      if (d.length < 30) continue;
      const z = madZ(d.map((x) => x.landed));
      d.forEach((x, i) => {
        if (z[i] > 4) spikes.push({ city: c, date: x.c_date, landed: x.landed, z: z[i], l2c: x.L2C });
      });
    }
    spikes.sort((a, b) => b.z - a.z);

    // the spike run: group the flagged days by city and report the widest
    const byCity = new Map<string, typeof spikes>();
    for (const s of spikes) {
      const a = byCity.get(s.city) ?? [];
      a.push(s);
      byCity.set(s.city, a);
    }
    let worstRun: { city: string; from: string; to: string; n: number; medL2c: number; base: number } | null = null;
    for (const [c, list] of byCity) {
      if (list.length < 2) continue;
      const dates = list.map((s) => s.date).sort();
      const all = daily(cc.filter((r) => r._city === c));
      const inRun = all.filter((x) => x.c_date >= dates[0] && x.c_date <= dates[dates.length - 1]);
      const outRun = all.filter((x) => x.c_date < dates[0] || x.c_date > dates[dates.length - 1]);
      const med = (xs: number[]): number => {
        if (!xs.length) return 0;
        const s = [...xs].sort((p, q) => p - q);
        return s[Math.floor(s.length / 2)];
      };
      const cand = {
        city: c,
        from: dates[0],
        to: dates[dates.length - 1],
        n: list.length,
        medL2c: med(inRun.map((x) => x.L2C ?? 0)),
        base: med(outRun.map((x) => x.L2C ?? 0)),
      };
      if (!worstRun || cand.n > worstRun.n) worstRun = cand;
    }

    const bestL2c = [...rows].sort((a, b) => (b.L2C ?? 0) - (a.L2C ?? 0))[0];
    const worstL2c = [...rows].sort((a, b) => (a.L2C ?? 0) - (b.L2C ?? 0))[0];

    return { rows, cur, base, series, cities, spikes, worstRun, bestL2c, worstL2c };
  }, [ctx]);

  const kpis = buildKpis(view.cur, view.base, [
    { label: "Landed", key: "landed", unit: "count", dir: "good" },
    { label: "Registrations", key: "conversions", unit: "count", dir: "good" },
    { label: "GTV", key: "gtv", unit: "rupee", dir: "good" },
    { label: "Spend", key: "spend", unit: "rupee", dir: "neu" },
    { label: "Landed → Reg", key: "L2C", unit: "pct", dir: "good" },
    { label: "ROAS", key: "ROAS", unit: "ratio", dir: "good" },
    { label: "CAC", key: "CPA", unit: "rupee", dir: "cost" },
    { label: "AOV", key: "AOV", unit: "rupee", dir: "good" },
  ]);

  const cols: Col<CityRow>[] = [
    { key: "city", label: "City", get: (r) => r.city },
    { key: "landed", label: "Landed", get: (r) => r.landed, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "leads", label: "Leads", get: (r) => r.lead_submitted, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "conv", label: "Regs", get: (r) => r.conversions, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "gtv", label: "GTV", get: (r) => r.gtv, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "share", label: "% of GTV", get: (r) => r.gtvShare, fmt: (v) => fmtPct(v as number), align: "right" },
    { key: "spend", label: "Spend", get: (r) => r.spend, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "l2l", label: "L→Lead", get: (r) => r.L2L, fmt: (v) => fmtPct(v as number), align: "right" },
    { key: "l2p", label: "Lead→Pay", get: (r) => r.L2P, fmt: (v) => fmtPct(v as number), align: "right" },
    { key: "p2c", label: "Pay→Reg", get: (r) => r.P2C, fmt: (v) => fmtPct(v as number), align: "right" },
    { key: "l2c", label: "Landed→Reg", get: (r) => r.L2C, fmt: (v) => fmtPct(v as number, 2), align: "right" },
    { key: "roas", label: "ROAS", get: (r) => r.ROAS, fmt: (v) => fmtRatio(v as number), align: "right" },
    { key: "cac", label: "CAC", get: (r) => r.CPA, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "aov", label: "AOV", get: (r) => r.AOV, fmt: (v) => fmtInr(v as number), align: "right" },
  ];

  return (
    <div className="stack">
      <KpiCards items={kpis} />

      {view.worstRun ? (
        <Callout tone="crit" title="A city-local traffic spike with no intent behind it">
          {view.worstRun.city} shows {view.worstRun.n} days flagged above 4 robust sigma on
          daily landings between {fmtDayFull(view.worstRun.from)} and{" "}
          {fmtDayFull(view.worstRun.to)}, while its landed-to-registration rate over that
          run sat at {fmtPct(view.worstRun.medL2c, 2)} against {fmtPct(view.worstRun.base, 2)}{" "}
          outside it. Traffic that arrives and does nothing is almost always non-human or
          mis-tagged, and leaving it in understates every funnel rate for that city. The
          Data Quality tab carries the full evidence.
        </Callout>
      ) : null}

      <div className="sec">
        <SectionHeader title="Daily registrations by city" sub="Stacked, so the mix and the total are both readable" />
        <div className="panel">
          <TrendChart
            data={view.series}
            bars={view.cities.map((c) => ({
              key: c,
              label: c,
              unit: "count",
              color: cityColor(theme, c),
              stackId: "c",
            }))}
            height={300}
          />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="City comparison"
          sub="Every funnel step separately — a city can look fine on landed-to-registration while failing at one stage"
        />
        <div className="panel">
          <DataTable rows={view.rows} cols={cols} sortKey="gtv" />
        </div>
      </div>

      <Callout tone="info" title="Best and worst funnels">
        {view.bestL2c.city} converts {fmtPct(view.bestL2c.L2C, 2)} of its landings into
        registrations against {fmtPct(view.worstL2c.L2C, 2)} in {view.worstL2c.city} — a
        spread of {fmtPct((view.bestL2c.L2C ?? 0) - (view.worstL2c.L2C ?? 0), 2)}. Check the
        stage columns before acting: a lead-stage gap is a form or offer problem, a
        pay-stage gap is usually price or payment friction.
      </Callout>

      <div className="grid-3">
        {view.rows.slice(0, 6).map((r) => (
          <div className="panel" key={r.city}>
            <div className="sec-t" style={{ marginBottom: 8 }}>
              {r.city}
            </div>
            <FunnelChart totals={derive(r)} />
          </div>
        ))}
      </div>
    </div>
  );
}
