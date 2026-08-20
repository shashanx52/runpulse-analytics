"use client";

import { useMemo, useState } from "react";
import KpiCards from "@/components/KpiCards";
import SectionHeader from "@/components/SectionHeader";
import Segmented from "@/components/Segmented";
import TrendChart from "@/components/TrendChart";
import DataTable, { type Col } from "@/components/DataTable";
import Callout from "@/components/Callout";
import { useTable } from "./ctx";
import { aggDetail, detailTotals, type DetailAgg } from "@/lib/tabkit";
import { fmtInr, fmtInt, fmtNum, fmtPct, fmtRatio, prettyCampaign } from "@/lib/format";
import type { MetaRow, TabCtx } from "@/lib/types";

const DIMS = [
  { value: "campaign_name", label: "Campaign" },
  { value: "adset_name", label: "Ad set" },
  { value: "creative", label: "Creative" },
  { value: "creative_type", label: "Creative type" },
  { value: "objective", label: "Objective" },
  { value: "city", label: "City" },
];

export default function MetaTab({ ctx }: { ctx: TabCtx }) {
  const { rows: all, loading, error } = useTable<MetaRow>("/api/meta");
  const [dim, setDim] = useState("campaign_name");

  const view = useMemo(() => {
    const rows = all.filter(
      (r) =>
        r.date >= ctx.start &&
        r.date <= ctx.end &&
        (!ctx.city || r.city === ctx.city)
    );
    const byDim = aggDetail(rows, (r) => String(r[dim as keyof MetaRow] ?? ""));
    const tot = detailTotals(byDim);

    const byDay = aggDetail(rows, (r) => r.date)
      .slice()
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((d) => ({
        c_date: d.key,
        spend: d.spend,
        conversions: d.conversions,
        ctr: d.ctr ?? 0,
        cpc: d.cpc ?? 0,
      }));

    // Creative fatigue: CTR by days on air. Launch date is taken from the creative's
    // first appearance in the whole season, not the filtered window — otherwise a narrow
    // date filter restarts every creative at day zero.
    const firstSeen = new Map<string, string>();
    for (const r of all) {
      const p = firstSeen.get(r.creative);
      if (!p || r.date < p) firstSeen.set(r.creative, r.date);
    }
    const ms = 86400000;
    const age = (d: string, c: string): number => {
      const f = firstSeen.get(c);
      if (!f) return 0;
      return Math.round(
        (new Date(d + "T00:00:00Z").getTime() - new Date(f + "T00:00:00Z").getTime()) / ms
      );
    };

    const topCreatives = aggDetail(rows, (r) => r.creative).slice(0, 6);
    const keys = new Set(topCreatives.map((c) => c.key));
    const fatigueMap = new Map<number, Record<string, number>>();
    const acc = new Map<string, Map<number, { imp: number; clicks: number }>>();
    for (const r of rows) {
      if (!keys.has(r.creative)) continue;
      const a = age(r.date, r.creative);
      let m = acc.get(r.creative);
      if (!m) {
        m = new Map();
        acc.set(r.creative, m);
      }
      const o = m.get(a) ?? { imp: 0, clicks: 0 };
      o.imp += r.impressions;
      o.clicks += r.clicks;
      m.set(a, o);
    }
    for (const [cr, m] of acc) {
      for (const [a, o] of m) {
        const row = fatigueMap.get(a) ?? {};
        row[cr] = o.imp > 0 ? (o.clicks / o.imp) * 100 : 0;
        fatigueMap.set(a, row);
      }
    }
    const fatigue = [...fatigueMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([a, r]) => ({ c_date: String(a), ...r }));

    // steepest CTR decline over a creative's life, measured as first week vs last week
    let steepest: { key: string; from: number; to: number; drop: number } | null = null;
    for (const [cr, m] of acc) {
      const ages = [...m.keys()].sort((x, y) => x - y);
      if (ages.length < 14) continue;
      const early = ages.slice(0, 7);
      const late = ages.slice(-7);
      const rate = (list: number[]): number => {
        let i = 0;
        let c = 0;
        for (const a of list) {
          const o = m.get(a);
          if (o) {
            i += o.imp;
            c += o.clicks;
          }
        }
        return i > 0 ? (c / i) * 100 : 0;
      };
      const f = rate(early);
      const t = rate(late);
      if (f <= 0) continue;
      const drop = ((t - f) / f) * 100;
      if (!steepest || drop < steepest.drop) steepest = { key: cr, from: f, to: t, drop };
    }

    return { rows, byDim, tot, byDay, fatigue, topCreatives, steepest };
  }, [all, ctx, dim]);

  if (loading) return <div className="skel" style={{ height: 320 }} />;
  if (error)
    return (
      <Callout tone="crit" title="Could not load the Meta export">
        {error}
      </Callout>
    );
  if (!view.rows.length)
    return <div className="empty">No Meta activity in this window or city.</div>;

  const t = view.tot;
  const kpis = [
    { label: "Spend", value: fmtInr(t.spend), delta: null, dir: "neu" as const },
    { label: "Impressions", value: fmtNum(t.impressions), delta: null, dir: "neu" as const },
    { label: "Clicks", value: fmtInt(t.clicks), delta: null, dir: "neu" as const },
    { label: "CTR", value: fmtPct(t.ctr, 2), delta: null, dir: "good" as const },
    { label: "CPC", value: fmtInr(t.cpc), delta: null, dir: "cost" as const },
    { label: "Registrations", value: fmtInt(t.conversions), delta: null, dir: "good" as const },
    { label: "ROAS", value: fmtRatio(t.roas), delta: null, dir: "good" as const },
    { label: "CAC", value: fmtInr(t.cac), delta: null, dir: "cost" as const },
  ];

  const cols: Col<DetailAgg>[] = [
    {
      key: "key",
      label: DIMS.find((d) => d.value === dim)?.label ?? "Entity",
      get: (r) => r.key,
      fmt: (v) => prettyCampaign(String(v)),
    },
    { key: "spend", label: "Spend", get: (r) => r.spend, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "imp", label: "Impr.", get: (r) => r.impressions, fmt: (v) => fmtNum(v as number), align: "right" },
    { key: "ctr", label: "CTR", get: (r) => r.ctr, fmt: (v) => fmtPct(v as number, 2), align: "right" },
    { key: "cpc", label: "CPC", get: (r) => r.cpc, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "cpm", label: "CPM", get: (r) => r.cpm, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "landed", label: "Landed", get: (r) => r.landed, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "l2l", label: "L→Lead", get: (r) => r.l2l, fmt: (v) => fmtPct(v as number), align: "right" },
    { key: "conv", label: "Regs", get: (r) => r.conversions, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "l2c", label: "L→Reg", get: (r) => r.l2c, fmt: (v) => fmtPct(v as number, 2), align: "right" },
    { key: "gtv", label: "GTV", get: (r) => r.gtv, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "roas", label: "ROAS", get: (r) => r.roas, fmt: (v) => fmtRatio(v as number), align: "right" },
    { key: "cac", label: "CAC", get: (r) => r.cac, fmt: (v) => fmtInr(v as number), align: "right" },
  ];

  return (
    <div className="stack">
      <KpiCards items={kpis} />

      <div className="sec">
        <SectionHeader
          title="Daily spend, registrations and click cost"
          sub="CPC on the right axis — rising CPC against flat registrations is the first sign of saturation"
        />
        <div className="panel">
          <TrendChart
            data={view.byDay}
            bars={[
              { key: "spend", label: "Spend", unit: "rupee" },
              { key: "conversions", label: "Registrations", unit: "count" },
            ]}
            lines={[{ key: "cpc", label: "CPC", unit: "rupee", yAxis: "right" }]}
            height={280}
          />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Drill-down"
          sub={view.byDim.length + " rows at this level"}
          right={<Segmented options={DIMS} value={dim} onChange={setDim} size="sm" />}
        />
        <div className="panel">
          <DataTable rows={view.byDim} cols={cols} sortKey="spend" maxRows={15} dense />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Creative fatigue"
          sub="CTR by days on air for the six highest-spending creatives. The x axis is age, not date, so creatives launched months apart are comparable"
        />
        <div className="panel">
          <TrendChart
            data={view.fatigue}
            lines={view.topCreatives.map((c) => ({
              key: c.key,
              label: c.key,
              unit: "pct",
            }))}
            height={300}
            caption="Each line is one creative; x is days since that creative first ran."
          />
        </div>
      </div>

      {view.steepest ? (
        <Callout tone="warn" title="Steepest measured CTR decline">
          {view.steepest.key} fell from {fmtPct(view.steepest.from, 2)} CTR in its first
          week on air to {fmtPct(view.steepest.to, 2)} in its last — a{" "}
          {fmtPct(Math.abs(view.steepest.drop))} decline. Creative decay of that size is
          usually cheaper to fix with a new asset than with a higher bid.
        </Callout>
      ) : null}
    </div>
  );
}
