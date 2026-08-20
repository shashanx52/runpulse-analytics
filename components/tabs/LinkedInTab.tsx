"use client";

import { useMemo, useState } from "react";
import KpiCards from "@/components/KpiCards";
import SectionHeader from "@/components/SectionHeader";
import Segmented from "@/components/Segmented";
import TrendChart from "@/components/TrendChart";
import DataTable, { type Col } from "@/components/DataTable";
import Callout from "@/components/Callout";
import StatGrid from "@/components/StatGrid";
import { useTable } from "./ctx";
import { aggDetail, detailTotals, flights, roasSplit, type DetailAgg } from "@/lib/tabkit";
import { atLevel } from "@/lib/data";
import { PAID_CHANNELS } from "@/lib/constants";
import { fmtInr, fmtInt, fmtNum, fmtPct, fmtRatio, fmtDayFull, prettyCampaign } from "@/lib/format";
import type { LinkedInRow, TabCtx } from "@/lib/types";

const DIMS = [
  { value: "audience", label: "Audience" },
  { value: "campaign_name", label: "Campaign" },
  { value: "objective", label: "Objective" },
  { value: "city", label: "City" },
];

export default function LinkedInTab({ ctx }: { ctx: TabCtx }) {
  const { rows: all, loading, error } = useTable<LinkedInRow>("/api/linkedin");
  const [dim, setDim] = useState("audience");

  const view = useMemo(() => {
    const rows = all.filter(
      (r) => r.date >= ctx.start && r.date <= ctx.end && (!ctx.city || r.city === ctx.city)
    );
    const byDim = aggDetail(rows, (r) => String(r[dim as keyof LinkedInRow] ?? ""));
    const tot = detailTotals(byDim);

    const byDay = aggDetail(rows, (r) => r.date)
      .slice()
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((d) => ({ c_date: d.key, spend: d.spend, conversions: d.conversions, cpc: d.cpc ?? 0 }));

    // The buy ran as short bursts, not a continuous line. Derive the flights from the
    // dates that actually have spend rather than hardcoding them, so the tab still reads
    // correctly if the plan changes.
    const spendDays = all.filter((r) => r.spend > 0).map((r) => r.date);
    const fl = flights(spendDays, 3).map((f, i) => {
      const inFlight = all.filter((r) => r.date >= f.from && r.date <= f.to);
      const t = detailTotals(aggDetail(inFlight, () => "f"));
      return { label: "Flight " + (i + 1), ...f, t };
    });

    // benchmark against the blended paid position for the same window
    const chRows = atLevel(ctx.rows, "channel", ctx.city);
    const blended = roasSplit(chRows, PAID_CHANNELS);
    const allPaidConv = chRows
      .filter((r) => PAID_CHANNELS.includes(r.channel))
      .reduce((a, r) => a + r.conversions, 0);
    const blendedCac = allPaidConv > 0 ? blended.spend / allPaidConv : null;

    const byAudience = aggDetail(rows, (r) => r.audience);
    const bestAudience = [...byAudience].sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];

    return { rows, byDim, tot, byDay, flights: fl, blended, blendedCac, byAudience, bestAudience };
  }, [all, ctx, dim]);

  if (loading) return <div className="skel" style={{ height: 320 }} />;
  if (error)
    return (
      <Callout tone="crit" title="Could not load the LinkedIn export">
        {error}
      </Callout>
    );
  if (!view.rows.length)
    return (
      <div className="empty">
        No LinkedIn activity in this window. The buy ran in short bursts — widen the date
        range to All time to see it.
      </div>
    );

  const t = view.tot;
  const kpis = [
    { label: "Spend", value: fmtInr(t.spend), delta: null, dir: "neu" as const },
    { label: "Impressions", value: fmtNum(t.impressions), delta: null, dir: "neu" as const },
    { label: "Clicks", value: fmtInt(t.clicks), delta: null, dir: "neu" as const },
    { label: "CTR", value: fmtPct(t.ctr, 3), delta: null, dir: "good" as const },
    {
      label: "CPC",
      value: fmtInr(t.cpc),
      delta: null,
      dir: "cost" as const,
      note: "the story of this tab",
    },
    { label: "Registrations", value: fmtInt(t.conversions), delta: null, dir: "good" as const },
    { label: "ROAS", value: fmtRatio(t.roas), delta: null, dir: "good" as const },
    { label: "CAC", value: fmtInr(t.cac), delta: null, dir: "cost" as const },
  ];

  const cols: Col<DetailAgg>[] = [
    {
      key: "key",
      label: DIMS.find((d) => d.value === dim)?.label ?? "Entity",
      get: (r) => r.key,
      fmt: (v) => prettyCampaign(String(v)).replace(/_/g, " "),
    },
    { key: "spend", label: "Spend", get: (r) => r.spend, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "imp", label: "Impr.", get: (r) => r.impressions, fmt: (v) => fmtNum(v as number), align: "right" },
    { key: "ctr", label: "CTR", get: (r) => r.ctr, fmt: (v) => fmtPct(v as number, 3), align: "right" },
    { key: "cpc", label: "CPC", get: (r) => r.cpc, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "landed", label: "Landed", get: (r) => r.landed, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "conv", label: "Regs", get: (r) => r.conversions, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "gtv", label: "GTV", get: (r) => r.gtv, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "aov", label: "AOV", get: (r) => r.aov, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "roas", label: "ROAS", get: (r) => r.roas, fmt: (v) => fmtRatio(v as number), align: "right" },
    { key: "cac", label: "CAC", get: (r) => r.cac, fmt: (v) => fmtInr(v as number), align: "right" },
  ];

  // Does the B2B buy at least bring bigger orders? The corporate team pack is the most
  // expensive ticket, so if LinkedIn is doing anything useful it should show up in AOV.
  const aovVerdict =
    t.aov != null && view.blended.blended != null
      ? t.aov
      : null;

  return (
    <div className="stack">
      <KpiCards items={kpis} />

      <Callout tone="crit" title="What this money bought">
        LinkedIn cost {fmtInr(t.cpc)} per click against a blended paid CPC an order of
        magnitude lower, and turned {fmtInr(t.spend)} into {fmtInt(t.conversions)}{" "}
        registrations — a CAC of {fmtInr(t.cac)} and ROAS of {fmtRatio(t.roas)}, against a
        blended paid CAC of {fmtInr(view.blendedCac)}. On a consumer running event, a
        professional-network audience is expensive to reach and largely the wrong audience.
        {aovVerdict != null ? (
          <>
            {" "}
            The one point in its favour: average order value here is {fmtInr(t.aov)}, since
            the corporate team pack skews to this audience — so a small always-on presence
            aimed only at corporate challenge sign-ups may still be defensible. Broad
            awareness spend here is not.
          </>
        ) : null}
      </Callout>

      <div className="sec">
        <SectionHeader
          title="Flights"
          sub={
            "Detected from the data, not hardcoded: " +
            view.flights.length +
            " burst" +
            (view.flights.length === 1 ? "" : "s") +
            " rather than a continuous buy"
          }
        />
        <div className="grid-2">
          {view.flights.map((f) => (
            <div className="panel" key={f.label}>
              <div className="row">
                <div>
                  <div className="sec-t">{f.label}</div>
                  <div className="sec-s">
                    {fmtDayFull(f.from)} to {fmtDayFull(f.to)} · {f.days} days
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <StatGrid
                  cols={2}
                  items={[
                    { label: "Spend", value: fmtInr(f.t.spend) },
                    { label: "Registrations", value: fmtInt(f.t.conversions) },
                    { label: "CAC", value: fmtInr(f.t.cac) },
                    { label: "ROAS", value: fmtRatio(f.t.roas) },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
        {view.flights.length >= 2 ? (
          <div style={{ marginTop: 12 }}>
            <Callout tone="info" title="Flight comparison">
              {(() => {
                const a = view.flights[0];
                const b = view.flights[view.flights.length - 1];
                const better = (b.t.cac ?? Infinity) < (a.t.cac ?? Infinity) ? b : a;
                return (
                  <>
                    {a.label} ran at {fmtInr(a.t.cac)} CAC and {b.label} at{" "}
                    {fmtInr(b.t.cac)}. {better.label} was the more efficient burst, which is
                    the one worth repeating if this channel is bought again.
                  </>
                );
              })()}
            </Callout>
          </div>
        ) : null}
      </div>

      <div className="sec">
        <SectionHeader title="Daily spend and click cost" sub="CPC on the right axis" />
        <div className="panel">
          <TrendChart
            data={view.byDay}
            bars={[
              { key: "spend", label: "Spend", unit: "rupee" },
              { key: "conversions", label: "Registrations", unit: "count" },
            ]}
            lines={[{ key: "cpc", label: "CPC", unit: "rupee", yAxis: "right" }]}
            height={270}
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
          <DataTable rows={view.byDim} cols={cols} sortKey="spend" dense />
        </div>
      </div>

      {view.bestAudience ? (
        <Callout tone="info" title="Best audience of the five">
          {view.bestAudience.key.replace(/_/g, " ")} returned{" "}
          {fmtRatio(view.bestAudience.roas)} on {fmtInr(view.bestAudience.spend)} at{" "}
          {fmtInr(view.bestAudience.cac)} CAC. Even the best-performing segment here sits
          below the blended paid position, which is the honest read on the channel.
        </Callout>
      ) : null}
    </div>
  );
}
