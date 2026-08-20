"use client";

import { useMemo } from "react";
import KpiCards from "@/components/KpiCards";
import SectionHeader from "@/components/SectionHeader";
import FunnelChart from "@/components/FunnelChart";
import ChannelMix from "@/components/ChannelMix";
import TrendChart from "@/components/TrendChart";
import DataTable, { type Col } from "@/components/DataTable";
import Callout from "@/components/Callout";
import { atLevel, byEntity, daily, filterDates, priorWindow, rollingMean, totalsFor } from "@/lib/data";
import { buildKpis, roasSplit } from "@/lib/tabkit";
import { PAID_CHANNELS } from "@/lib/constants";
import { fmtInr, fmtInt, fmtPct, fmtRatio } from "@/lib/format";
import type { EntityRow, TabCtx } from "@/lib/types";

export default function OverallTab({ ctx }: { ctx: TabCtx }) {
  const view = useMemo(() => {
    const chRows = atLevel(ctx.rows, "channel", ctx.city);
    // With a city filter on, the "overall" level has no city dimension, so the channel
    // rows re-keyed by city are the honest total. Without one, use overall directly.
    const totalRows = ctx.city ? chRows : atLevel(ctx.rows, "overall");
    const cur = totalsFor(totalRows);

    const pw = priorWindow(ctx.start, ctx.end);
    const prevRows = filterDates(ctx.rowsFull, pw.start, pw.end);
    const prevCh = atLevel(prevRows, "channel", ctx.city);
    const base = totalsFor(ctx.city ? prevCh : atLevel(prevRows, "overall"));

    const roas = roasSplit(chRows, PAID_CHANNELS);
    const prevRoas = roasSplit(prevCh, PAID_CHANNELS);

    const d = daily(totalRows);
    const spendByDay = new Map(daily(chRows).map((x) => [x.c_date, x.spend]));
    const smooth = rollingMean(d.map((x) => x.conversions), 7);
    const series = d.map((x, i) => ({
      c_date: x.c_date,
      conversions: x.conversions,
      gtv: x.gtv,
      spend: spendByDay.get(x.c_date) ?? 0,
      trend: smooth[i],
      roas: (spendByDay.get(x.c_date) ?? 0) > 0 ? x.gtv / (spendByDay.get(x.c_date) as number) : 0,
    }));

    const channels = byEntity(chRows, "spend");
    const totalSpend = roas.spend;
    const totalGtv = channels.reduce((a, c) => a + c.gtv, 0);

    // the finding the callout states: the channel whose share of revenue most
    // undershoots its share of spend
    const paid = channels.filter((c) => c.spend > 0);
    const worst = paid
      .map((c) => ({
        entity: c.entity,
        spendShare: totalSpend > 0 ? (c.spend / totalSpend) * 100 : 0,
        gtvShare: totalGtv > 0 ? (c.gtv / totalGtv) * 100 : 0,
        roas: c.ROAS,
        cac: c.CPA,
      }))
      .sort((a, b) => a.gtvShare - a.spendShare - (b.gtvShare - b.spendShare))[0];

    return { cur, base, roas, prevRoas, series, channels, totalSpend, totalGtv, worst };
  }, [ctx]);

  const kpis = buildKpis(view.cur, view.base, [
    { label: "Landed", key: "landed", unit: "count", dir: "good" },
    { label: "Leads", key: "lead_submitted", unit: "count", dir: "good" },
    { label: "Registrations", key: "conversions", unit: "count", dir: "good" },
    { label: "GTV", key: "gtv", unit: "rupee", dir: "good" },
  ]);

  const kpis2 = [
    ...buildKpis(view.cur, view.base, [
      { label: "AOV", key: "AOV", unit: "rupee", dir: "good" },
      { label: "Landed → Reg", key: "L2C", unit: "pct", dir: "good" },
    ]),
    {
      label: "Paid spend",
      value: fmtInr(view.roas.spend),
      delta:
        view.prevRoas.spend > 0
          ? ((view.roas.spend - view.prevRoas.spend) / view.prevRoas.spend) * 100
          : null,
      dir: "neu" as const,
      sub: "vs prior",
    },
    {
      label: "Blended ROAS",
      value: fmtRatio(view.roas.blended),
      delta:
        view.prevRoas.blended && view.roas.blended
          ? ((view.roas.blended - view.prevRoas.blended) / view.prevRoas.blended) * 100
          : null,
      dir: "good" as const,
      sub: "vs prior",
      note: "paid-only " + fmtRatio(view.roas.paidOnly),
    },
  ];

  const cols: Col<EntityRow>[] = [
    { key: "entity", label: "Channel", get: (r) => r.entity },
    { key: "spend", label: "Spend", get: (r) => r.spend, fmt: (v) => fmtInr(v as number), align: "right" },
    {
      key: "share",
      label: "% of spend",
      get: (r) => (view.totalSpend > 0 ? (r.spend / view.totalSpend) * 100 : null),
      fmt: (v) => fmtPct(v as number),
      align: "right",
    },
    { key: "landed", label: "Landed", get: (r) => r.landed, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "leads", label: "Leads", get: (r) => r.lead_submitted, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "conv", label: "Regs", get: (r) => r.conversions, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "gtv", label: "GTV", get: (r) => r.gtv, fmt: (v) => fmtInr(v as number), align: "right" },
    {
      key: "gtvshare",
      label: "% of GTV",
      get: (r) => (view.totalGtv > 0 ? (r.gtv / view.totalGtv) * 100 : null),
      fmt: (v) => fmtPct(v as number),
      align: "right",
    },
    { key: "l2c", label: "Landed→Reg", get: (r) => r.L2C, fmt: (v) => fmtPct(v as number), align: "right" },
    { key: "roas", label: "ROAS", get: (r) => r.ROAS, fmt: (v) => fmtRatio(v as number), align: "right" },
    { key: "cac", label: "CAC", get: (r) => r.CPA, fmt: (v) => fmtInr(v as number), align: "right" },
  ];

  return (
    <div className="stack">
      <KpiCards items={kpis} />
      <KpiCards items={kpis2} />

      <Callout tone="info" title="Blended and paid-only ROAS are not the same number">
        Blended ROAS is {fmtRatio(view.roas.blended)} because it counts organic, email and
        referral revenue against paid spend. Paid channels on their own returned{" "}
        {fmtRatio(view.roas.paidOnly)}. On an event with real brand awareness the gap is
        mostly demand the media did not buy, so quoting the blended figure as media
        performance flatters the buy.
      </Callout>

      <div className="sec">
        <SectionHeader
          title="Daily registrations and revenue"
          sub="Bars are registrations and GTV; the dashed line is a 7-day rolling mean of registrations, and ROAS sits on the right axis"
        />
        <div className="panel">
          <TrendChart
            data={view.series}
            bars={[
              { key: "conversions", label: "Registrations", unit: "count" },
              { key: "gtv", label: "GTV", unit: "rupee" },
            ]}
            lines={[
              { key: "trend", label: "Registrations, 7d mean", unit: "count", dashed: true },
              { key: "roas", label: "ROAS", unit: "ratio", yAxis: "right" },
            ]}
            height={300}
          />
        </div>
      </div>

      <div className="grid-2">
        <div>
          <SectionHeader title="Funnel" sub="Every stage for the selected window" />
          <div className="panel">
            <FunnelChart totals={view.cur} />
          </div>
        </div>
        <div>
          <SectionHeader title="Where the money went, and what came back" sub="Share of paid spend against share of GTV" />
          <div className="panel stack">
            <div>
              <div className="stat-l" style={{ marginBottom: 6 }}>Share of spend</div>
              <ChannelMix rows={atLevel(ctx.rows, "channel", ctx.city)} metric="spend" />
            </div>
            <div>
              <div className="stat-l" style={{ marginBottom: 6 }}>Share of GTV</div>
              <ChannelMix rows={atLevel(ctx.rows, "channel", ctx.city)} metric="gtv" />
            </div>
          </div>
        </div>
      </div>

      {view.worst ? (
        <Callout tone="warn" title="Widest gap between spend share and revenue share">
          {view.worst.entity} took {fmtPct(view.worst.spendShare)} of paid spend and returned{" "}
          {fmtPct(view.worst.gtvShare)} of GTV — a shortfall of{" "}
          {fmtPct(view.worst.spendShare - view.worst.gtvShare)} at a CAC of{" "}
          {fmtInr(view.worst.cac)} and ROAS of {fmtRatio(view.worst.roas)}. The ML Lab tab
          fits a response curve per channel and puts a number on what moving that budget
          would buy.
        </Callout>
      ) : null}

      <div className="sec">
        <SectionHeader title="Channel detail" sub="Sortable; earned channels carry no spend, so their ROAS and CAC are blank by definition" />
        <div className="panel">
          <DataTable rows={view.channels} cols={cols} sortKey="spend" />
        </div>
      </div>
    </div>
  );
}
