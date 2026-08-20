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
import type { GoogleRow, TabCtx } from "@/lib/types";

const DIMS = [
  { value: "campaign_type", label: "Campaign type" },
  { value: "campaign_name", label: "Campaign" },
  { value: "city", label: "City" },
];

export default function GoogleTab({ ctx }: { ctx: TabCtx }) {
  const { rows: all, loading, error } = useTable<GoogleRow>("/api/google");
  const [dim, setDim] = useState("campaign_type");

  const view = useMemo(() => {
    const rows = all.filter(
      (r) => r.date >= ctx.start && r.date <= ctx.end && (!ctx.city || r.city === ctx.city)
    );
    const byDim = aggDetail(rows, (r) => String(r[dim as keyof GoogleRow] ?? ""));
    const tot = detailTotals(byDim);

    const byDay = aggDetail(rows, (r) => r.date)
      .slice()
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((d) => ({
        c_date: d.key,
        spend: d.spend,
        conversions: d.conversions,
        roas: d.roas ?? 0,
      }));

    // The point of this tab. Brand search converts people who were already looking for
    // the event by name, so its ROAS is enormous and it drags the whole channel average
    // up with it. The number a media decision needs is Google excluding brand.
    const brand = rows.filter((r) => r.campaign_type === "search_brand");
    const nonBrand = rows.filter((r) => r.campaign_type !== "search_brand");
    const brandT = detailTotals(aggDetail(brand, () => "brand"));
    const nonBrandT = detailTotals(aggDetail(nonBrand, () => "nonbrand"));

    const byType = aggDetail(rows, (r) => r.campaign_type);
    const byCampaignCity = aggDetail(rows, (r) => r.campaign_name + " | " + r.city);

    return { rows, byDim, tot, byDay, brandT, nonBrandT, byType, byCampaignCity };
  }, [all, ctx, dim]);

  if (loading) return <div className="skel" style={{ height: 320 }} />;
  if (error)
    return (
      <Callout tone="crit" title="Could not load the Google export">
        {error}
      </Callout>
    );
  if (!view.rows.length)
    return <div className="empty">No Google activity in this window or city.</div>;

  const t = view.tot;
  const kpis = [
    { label: "Spend", value: fmtInr(t.spend), delta: null, dir: "neu" as const },
    { label: "Impressions", value: fmtNum(t.impressions), delta: null, dir: "neu" as const },
    { label: "CTR", value: fmtPct(t.ctr, 2), delta: null, dir: "good" as const },
    { label: "CPC", value: fmtInr(t.cpc), delta: null, dir: "cost" as const },
    { label: "Registrations", value: fmtInt(t.conversions), delta: null, dir: "good" as const },
    { label: "GTV", value: fmtInr(t.gtv), delta: null, dir: "good" as const },
    {
      label: "ROAS",
      value: fmtRatio(t.roas),
      delta: null,
      dir: "good" as const,
      note: "excl. brand " + fmtRatio(view.nonBrandT.roas),
    },
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
    { key: "landed", label: "Landed", get: (r) => r.landed, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "l2l", label: "L→Lead", get: (r) => r.l2l, fmt: (v) => fmtPct(v as number), align: "right" },
    { key: "conv", label: "Regs", get: (r) => r.conversions, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "l2c", label: "L→Reg", get: (r) => r.l2c, fmt: (v) => fmtPct(v as number, 2), align: "right" },
    { key: "gtv", label: "GTV", get: (r) => r.gtv, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "roas", label: "ROAS", get: (r) => r.roas, fmt: (v) => fmtRatio(v as number), align: "right" },
    { key: "cac", label: "CAC", get: (r) => r.cac, fmt: (v) => fmtInr(v as number), align: "right" },
  ];

  const brandShare = t.spend > 0 ? (view.brandT.spend / t.spend) * 100 : 0;

  return (
    <div className="stack">
      <KpiCards items={kpis} />

      <Callout tone="warn" title="Brand search is inflating this channel">
        Brand search took {fmtPct(brandShare)} of Google spend at {fmtRatio(view.brandT.roas)}{" "}
        ROAS and {fmtInr(view.brandT.cac)} CAC. Strip it out and the rest of Google returns{" "}
        {fmtRatio(view.nonBrandT.roas)} at {fmtInr(view.nonBrandT.cac)} CAC, against a
        channel headline of {fmtRatio(t.roas)}. People searching the event by name were
        largely going to register anyway, so brand ROAS measures demand capture, not
        demand creation — judge incremental spend on the non-brand figure.
      </Callout>

      <div className="grid-2">
        <div className="panel">
          <div className="stat-l">Brand search</div>
          <div className="row" style={{ marginTop: 8 }}>
            <div className="stat" style={{ flex: 1 }}>
              <div className="stat-l">Spend</div>
              <div className="stat-v">{fmtInr(view.brandT.spend)}</div>
            </div>
            <div className="stat" style={{ flex: 1 }}>
              <div className="stat-l">ROAS</div>
              <div className="stat-v good">{fmtRatio(view.brandT.roas)}</div>
            </div>
            <div className="stat" style={{ flex: 1 }}>
              <div className="stat-l">CAC</div>
              <div className="stat-v">{fmtInr(view.brandT.cac)}</div>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="stat-l">Everything else</div>
          <div className="row" style={{ marginTop: 8 }}>
            <div className="stat" style={{ flex: 1 }}>
              <div className="stat-l">Spend</div>
              <div className="stat-v">{fmtInr(view.nonBrandT.spend)}</div>
            </div>
            <div className="stat" style={{ flex: 1 }}>
              <div className="stat-l">ROAS</div>
              <div className="stat-v">{fmtRatio(view.nonBrandT.roas)}</div>
            </div>
            <div className="stat" style={{ flex: 1 }}>
              <div className="stat-l">CAC</div>
              <div className="stat-v">{fmtInr(view.nonBrandT.cac)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="sec">
        <SectionHeader title="Daily spend and return" sub="ROAS on the right axis" />
        <div className="panel">
          <TrendChart
            data={view.byDay}
            bars={[
              { key: "spend", label: "Spend", unit: "rupee" },
              { key: "conversions", label: "Registrations", unit: "count" },
            ]}
            lines={[{ key: "roas", label: "ROAS", unit: "ratio", yAxis: "right" }]}
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
        <SectionHeader title="Campaign by city" sub="Where each campaign actually landed its registrations" />
        <div className="panel">
          <DataTable rows={view.byCampaignCity} cols={cols} sortKey="spend" maxRows={12} dense />
        </div>
      </div>
    </div>
  );
}
