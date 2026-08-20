"use client";

import { useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import Segmented from "@/components/Segmented";
import DataTable, { type Col } from "@/components/DataTable";
import Callout from "@/components/Callout";
import KpiCards from "@/components/KpiCards";
import { atLevel, byEntity, daily, filterDates, madZ, median, movers, priorWindow } from "@/lib/data";
import { fmtDayFull, fmtInr, fmtInt, fmtPct, fmtRatio, prettyCampaign } from "@/lib/format";
import type { Flag, MoverRow, TabCtx, Totals } from "@/lib/types";

const LEVELS = [
  { value: "channel", label: "Channel" },
  { value: "meta_campaign", label: "Meta campaigns" },
  { value: "google_campaign", label: "Google campaigns" },
  { value: "linkedin_campaign", label: "LinkedIn" },
  { value: "source", label: "Source" },
  { value: "city", label: "City" },
  { value: "product", label: "Ticket" },
];

const METRICS = [
  { value: "conversions", label: "Registrations" },
  { value: "gtv", label: "GTV" },
  { value: "landed", label: "Landed" },
  { value: "spend", label: "Spend" },
];

const BADGE: Record<Flag, string> = {
  DEAD: "badge badge-crit",
  DOWN_BIG: "badge badge-crit",
  DOWN: "badge badge-warn",
  UP: "badge badge-good",
  FLAT: "badge badge-info",
  NA: "badge badge-info",
};

interface QuadRow {
  entity: string;
  spend: number;
  roas: number | null;
  conversions: number;
  quadrant: string;
}

interface AnomRow {
  entity: string;
  date: string;
  metric: string;
  value: number;
  z: number;
}

export default function AnalysisTab({ ctx }: { ctx: TabCtx }) {
  const [level, setLevel] = useState("channel");
  const [metric, setMetric] = useState<keyof Totals>("conversions");

  const view = useMemo(() => {
    const cur = atLevel(ctx.rows, level, ctx.city);
    const pw = priorWindow(ctx.start, ctx.end);
    const base = atLevel(filterDates(ctx.rowsFull, pw.start, pw.end), level, ctx.city);
    const mv = movers(cur, base, metric, level);

    const ents = byEntity(cur, "spend");

    // Funnel diagnostics: each entity's step rates against the window median, so a
    // collapse at one stage is visible instead of being smoothed into the overall rate.
    const medL2L = median(ents.map((e) => e.L2L ?? 0).filter((v) => v > 0));
    const medL2P = median(ents.map((e) => e.L2P ?? 0).filter((v) => v > 0));
    const medP2C = median(ents.map((e) => e.P2C ?? 0).filter((v) => v > 0));
    const diag = ents
      .filter((e) => e.landed > 0)
      .map((e) => ({
        entity: e.entity,
        landed: e.landed,
        l2l: e.L2L,
        l2lGap: (e.L2L ?? 0) - medL2L,
        l2p: e.L2P,
        l2pGap: (e.L2P ?? 0) - medL2P,
        p2c: e.P2C,
        p2cGap: (e.P2C ?? 0) - medP2C,
      }));

    // Anomaly scan over the daily series of each entity at this level.
    const anomalies: AnomRow[] = [];
    for (const e of ents) {
      const d = daily(cur.filter((r) => r.entity === e.entity));
      if (d.length < 30) continue;
      const series: [string, number[]][] = [
        ["landed", d.map((x) => x.landed)],
        ["registrations", d.map((x) => x.conversions)],
        ["landed→lead %", d.map((x) => x.L2L ?? 0)],
      ];
      for (const [name, vals] of series) {
        const z = madZ(vals);
        z.forEach((zz, i) => {
          if (Math.abs(zz) > 3.5) {
            anomalies.push({ entity: e.entity, date: d[i].c_date, metric: name, value: vals[i], z: zz });
          }
        });
      }
    }
    anomalies.sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

    // Efficiency quadrant against the window medians for paid entities.
    const paid = ents.filter((e) => e.spend > 0 && e.ROAS != null);
    const medSpend = median(paid.map((e) => e.spend));
    const medRoas = median(paid.map((e) => e.ROAS as number));
    const quad: QuadRow[] = paid.map((e) => {
      const hiSpend = e.spend >= medSpend;
      const hiRoas = (e.ROAS as number) >= medRoas;
      return {
        entity: e.entity,
        spend: e.spend,
        roas: e.ROAS,
        conversions: e.conversions,
        quadrant: hiRoas ? (hiSpend ? "Hold — working at scale" : "Scale up") : hiSpend ? "Cut or fix" : "Hold — small",
      };
    });

    const riser = mv.find((m) => m.delta > 0) ?? null;
    const decliner = mv.find((m) => m.delta < 0) ?? null;

    return { mv, diag, anomalies, quad, medSpend, medRoas, riser, decliner };
  }, [ctx, level, metric]);

  const moverCols: Col<MoverRow>[] = [
    { key: "entity", label: "Entity", get: (r) => r.entity, fmt: (v) => prettyCampaign(String(v)) },
    { key: "base", label: "Prior window", get: (r) => r.base, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "cur", label: "This window", get: (r) => r.cur, fmt: (v) => fmtInt(v as number), align: "right" },
    {
      key: "delta",
      label: "Change",
      get: (r) => r.delta,
      fmt: (v) => ((v as number) > 0 ? "+" : "") + fmtInt(v as number),
      align: "right",
    },
    { key: "pct", label: "%", get: (r) => r.pct, fmt: (v) => (v == null ? "—" : fmtPct(v as number)), align: "right" },
    {
      key: "flag",
      label: "Flag",
      get: (r) => r.flag,
      fmt: (v) => String(v),
      align: "left",
    },
  ];

  const anomCols: Col<AnomRow>[] = [
    { key: "date", label: "Date", get: (r) => r.date, fmt: (v) => fmtDayFull(String(v)) },
    { key: "entity", label: "Entity", get: (r) => r.entity, fmt: (v) => prettyCampaign(String(v)) },
    { key: "metric", label: "Metric", get: (r) => r.metric },
    { key: "value", label: "Value", get: (r) => r.value, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "z", label: "Robust z", get: (r) => r.z, fmt: (v) => (v as number).toFixed(1), align: "right" },
  ];

  const quadCols: Col<QuadRow>[] = [
    { key: "entity", label: "Entity", get: (r) => r.entity, fmt: (v) => prettyCampaign(String(v)) },
    { key: "spend", label: "Spend", get: (r) => r.spend, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "roas", label: "ROAS", get: (r) => r.roas, fmt: (v) => fmtRatio(v as number), align: "right" },
    { key: "conv", label: "Regs", get: (r) => r.conversions, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "q", label: "Verdict", get: (r) => r.quadrant },
  ];

  const kpis = [
    { label: "Entities tracked", value: fmtInt(view.mv.length), delta: null, dir: "neu" as const },
    {
      label: "Declining",
      value: fmtInt(view.mv.filter((m) => m.flag === "DOWN" || m.flag === "DOWN_BIG" || m.flag === "DEAD").length),
      delta: null,
      dir: "neu" as const,
    },
    { label: "Anomalies flagged", value: fmtInt(view.anomalies.length), delta: null, dir: "neu" as const, note: "|z| > 3.5" },
    { label: "Median ROAS", value: fmtRatio(view.medRoas), delta: null, dir: "neu" as const, note: "paid entities at this level" },
  ];

  return (
    <div className="stack">
      <KpiCards items={kpis} />

      <div className="row">
        <Segmented options={LEVELS} value={level} onChange={setLevel} size="sm" />
        <div className="spacer" />
        <Segmented
          options={METRICS}
          value={metric}
          onChange={(v) => setMetric(v as keyof Totals)}
          size="sm"
        />
      </div>

      <div className="grid-2">
        {view.decliner ? (
          <Callout tone="crit" title="Biggest decline">
            {prettyCampaign(view.decliner.entity)} fell {fmtInt(Math.abs(view.decliner.delta))}{" "}
            {metric === "gtv" ? "in GTV" : metric} against the prior equal window
            {view.decliner.pct != null ? " (" + fmtPct(view.decliner.pct) + ")" : ""}, from{" "}
            {fmtInt(view.decliner.base)} to {fmtInt(view.decliner.cur)}.
          </Callout>
        ) : null}
        {view.riser ? (
          <Callout tone="good" title="Biggest rise">
            {prettyCampaign(view.riser.entity)} gained {fmtInt(view.riser.delta)}{" "}
            {metric === "gtv" ? "in GTV" : metric}
            {view.riser.pct != null ? " (" + fmtPct(view.riser.pct) + ")" : ""}, from{" "}
            {fmtInt(view.riser.base)} to {fmtInt(view.riser.cur)}.
          </Callout>
        ) : null}
      </div>

      <div className="sec">
        <SectionHeader
          title="Movers"
          sub="Ranked by absolute change, not percentage — a 400% jump on two registrations is noise, and ranking by percentage puts it top every time"
        />
        <div className="panel">
          <DataTable
            rows={view.mv}
            cols={moverCols.map((c) =>
              c.key === "flag"
                ? {
                    ...c,
                    fmt: (v) => String(v),
                  }
                : c
            )}
            sortKey="delta"
            maxRows={12}
            dense
          />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Funnel diagnostics"
          sub="Each entity's step rates against the median at this level. A single negative gap localises the problem to one stage"
        />
        <div className="panel">
          <DataTable
            rows={view.diag}
            cols={[
              { key: "entity", label: "Entity", get: (r) => r.entity, fmt: (v) => prettyCampaign(String(v)) },
              { key: "landed", label: "Landed", get: (r) => r.landed, fmt: (v) => fmtInt(v as number), align: "right" },
              { key: "l2l", label: "L→Lead", get: (r) => r.l2l, fmt: (v) => fmtPct(v as number), align: "right" },
              {
                key: "l2lg",
                label: "vs median",
                get: (r) => r.l2lGap,
                fmt: (v) => ((v as number) > 0 ? "+" : "") + fmtPct(v as number),
                align: "right",
              },
              { key: "l2p", label: "Lead→Pay", get: (r) => r.l2p, fmt: (v) => fmtPct(v as number), align: "right" },
              {
                key: "l2pg",
                label: "vs median",
                get: (r) => r.l2pGap,
                fmt: (v) => ((v as number) > 0 ? "+" : "") + fmtPct(v as number),
                align: "right",
              },
              { key: "p2c", label: "Pay→Reg", get: (r) => r.p2c, fmt: (v) => fmtPct(v as number), align: "right" },
              {
                key: "p2cg",
                label: "vs median",
                get: (r) => r.p2cGap,
                fmt: (v) => ((v as number) > 0 ? "+" : "") + fmtPct(v as number),
                align: "right",
              },
            ]}
            sortKey="l2lg"
            maxRows={12}
            dense
          />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Anomaly scan"
          sub="Robust z-score on the median absolute deviation. A plain mean-and-sigma score lets a large spike inflate sigma enough to hide itself"
        />
        <div className="panel">
          <DataTable rows={view.anomalies} cols={anomCols} sortKey="z" maxRows={12} dense />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Efficiency quadrant"
          sub={
            "Split at the window medians: spend " +
            fmtInr(view.medSpend) +
            ", ROAS " +
            fmtRatio(view.medRoas)
          }
        />
        <div className="panel">
          <DataTable rows={view.quad} cols={quadCols} sortKey="spend" maxRows={12} dense />
        </div>
      </div>
    </div>
  );
}
