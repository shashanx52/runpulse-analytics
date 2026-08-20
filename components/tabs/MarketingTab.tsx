"use client";

import { useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import Segmented from "@/components/Segmented";
import TrendChart from "@/components/TrendChart";
import DataTable, { type Col } from "@/components/DataTable";
import Callout from "@/components/Callout";
import KpiCards from "@/components/KpiCards";
import { useTheme } from "@/lib/theme";
import { atLevel, byEntity, daily } from "@/lib/data";
import { channelColor, CHANNEL_LABEL, PAID_CHANNELS } from "@/lib/constants";
import { fmtByUnit, fmtInr, fmtInt, fmtPct, fmtRatio } from "@/lib/format";
import { roasSplit } from "@/lib/tabkit";
import type { TabCtx } from "@/lib/types";

const METRICS = [
  { value: "conversions", label: "Registrations", unit: "count" },
  { value: "gtv", label: "GTV", unit: "rupee" },
  { value: "spend", label: "Spend", unit: "rupee" },
  { value: "ROAS", label: "ROAS", unit: "ratio" },
  { value: "CPA", label: "CAC", unit: "rupee" },
  { value: "L2C", label: "Landed→Reg", unit: "pct" },
];

interface MixRow {
  channel: string;
  label: string;
  paid: boolean;
  spend: number;
  spendShare: number;
  gtv: number;
  gtvShare: number;
  gap: number;
  conversions: number;
  landed: number;
  roas: number | null;
  cac: number | null;
  l2c: number | null;
  aov: number | null;
}

export default function MarketingTab({ ctx }: { ctx: TabCtx }) {
  const { theme } = useTheme();
  const [metric, setMetric] = useState("conversions");

  const view = useMemo(() => {
    const chRows = atLevel(ctx.rows, "channel", ctx.city);
    const ents = byEntity(chRows, "spend");
    const totSpend = ents.reduce((a, e) => a + e.spend, 0);
    const totGtv = ents.reduce((a, e) => a + e.gtv, 0);

    const mix: MixRow[] = ents.map((e) => {
      const ss = totSpend > 0 ? (e.spend / totSpend) * 100 : 0;
      const gs = totGtv > 0 ? (e.gtv / totGtv) * 100 : 0;
      return {
        channel: e.channel ?? "",
        label: e.entity,
        paid: PAID_CHANNELS.includes(e.channel ?? ""),
        spend: e.spend,
        spendShare: ss,
        gtv: e.gtv,
        gtvShare: gs,
        gap: gs - ss,
        conversions: e.conversions,
        landed: e.landed,
        roas: e.ROAS,
        cac: e.CPA,
        l2c: e.L2C,
        aov: e.AOV,
      };
    });

    // one line per channel for the selected metric
    const channels = [...new Set(chRows.map((r) => r.channel))].filter(Boolean);
    const perDay = new Map<string, Record<string, number>>();
    for (const ch of channels) {
      for (const d of daily(chRows.filter((r) => r.channel === ch))) {
        const row = perDay.get(d.c_date) ?? {};
        const v = d[metric as keyof typeof d];
        row[ch] = typeof v === "number" ? v : 0;
        perDay.set(d.c_date, row);
      }
    }
    const series = [...perDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([c_date, r]) => ({ c_date, ...r }));

    const roas = roasSplit(chRows, PAID_CHANNELS);
    const paidOnly = mix.filter((m) => m.paid && m.spend > 0);
    const worstGap = [...paidOnly].sort((a, b) => a.gap - b.gap)[0];
    const bestGap = [...mix].sort((a, b) => b.gap - a.gap)[0];

    return { mix, series, channels, roas, worstGap, bestGap, totSpend, totGtv };
  }, [ctx, metric]);

  const unit = METRICS.find((m) => m.value === metric)?.unit ?? "count";

  const cols: Col<MixRow>[] = [
    { key: "label", label: "Channel", get: (r) => r.label },
    { key: "paid", label: "Type", get: (r) => (r.paid ? "Paid" : "Earned"), align: "left" },
    { key: "spend", label: "Spend", get: (r) => r.spend, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "ss", label: "% of spend", get: (r) => r.spendShare, fmt: (v) => fmtPct(v as number), align: "right" },
    { key: "gtv", label: "GTV", get: (r) => r.gtv, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "gs", label: "% of GTV", get: (r) => r.gtvShare, fmt: (v) => fmtPct(v as number), align: "right" },
    {
      key: "gap",
      label: "GTV share − spend share",
      get: (r) => r.gap,
      fmt: (v) => (v as number > 0 ? "+" : "") + fmtPct(v as number),
      align: "right",
    },
    { key: "conv", label: "Regs", get: (r) => r.conversions, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "l2c", label: "Landed→Reg", get: (r) => r.l2c, fmt: (v) => fmtPct(v as number, 2), align: "right" },
    { key: "roas", label: "ROAS", get: (r) => r.roas, fmt: (v) => fmtRatio(v as number), align: "right" },
    { key: "cac", label: "CAC", get: (r) => r.cac, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "aov", label: "AOV", get: (r) => r.aov, fmt: (v) => fmtInr(v as number), align: "right" },
  ];

  const kpis = [
    { label: "Paid spend", value: fmtInr(view.roas.spend), delta: null, dir: "neu" as const },
    { label: "Blended ROAS", value: fmtRatio(view.roas.blended), delta: null, dir: "good" as const },
    { label: "Paid-only ROAS", value: fmtRatio(view.roas.paidOnly), delta: null, dir: "good" as const },
    {
      label: "Channels active",
      value: String(view.mix.length),
      delta: null,
      dir: "neu" as const,
      note: view.mix.filter((m) => m.paid).length + " paid",
    },
  ];

  return (
    <div className="stack">
      <KpiCards items={kpis} />

      {view.worstGap ? (
        <Callout tone="warn" title="The gap that matters: revenue share against spend share">
          {view.worstGap.label} is the worst-positioned paid channel — {fmtPct(view.worstGap.spendShare)}{" "}
          of spend for {fmtPct(view.worstGap.gtvShare)} of revenue, a gap of{" "}
          {fmtPct(view.worstGap.gap)}. At the other end, {view.bestGap.label} contributes{" "}
          {fmtPct(view.bestGap.gtvShare)} of revenue on {fmtPct(view.bestGap.spendShare)} of
          spend. A channel is only genuinely mispriced when that gap survives a look at its
          marginal cost, which is what the response curves in ML Lab are for.
        </Callout>
      ) : null}

      <div className="sec">
        <SectionHeader
          title="Every channel, one metric at a time"
          sub="Earned channels have no spend, so they flatten to zero on the cost metrics"
          right={<Segmented options={METRICS} value={metric} onChange={setMetric} size="sm" />}
        />
        <div className="panel">
          <TrendChart
            data={view.series}
            lines={view.channels.map((ch) => ({
              key: ch,
              label: CHANNEL_LABEL[ch] ?? ch,
              unit,
              color: channelColor(theme, ch),
            }))}
            height={330}
          />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Efficiency against scale"
          sub="Paid channels only. Spend on the left bar, ROAS as the line — a channel with a tall bar and a low line is where the money is trapped"
        />
        <div className="panel">
          <TrendChart
            data={view.mix
              .filter((m) => m.paid && m.spend > 0)
              .map((m) => ({ c_date: m.label, spend: m.spend, roas: m.roas ?? 0, regs: m.conversions }))}
            bars={[{ key: "spend", label: "Spend", unit: "rupee" }]}
            lines={[
              { key: "roas", label: "ROAS", unit: "ratio", yAxis: "right" },
              { key: "regs", label: "Registrations", unit: "count" },
            ]}
            height={260}
          />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Full comparison"
          sub="Sorted by the gap between revenue share and spend share, which is the column this tab exists for"
        />
        <div className="panel">
          <DataTable rows={view.mix} cols={cols} sortKey="gap" />
        </div>
      </div>
    </div>
  );
}
