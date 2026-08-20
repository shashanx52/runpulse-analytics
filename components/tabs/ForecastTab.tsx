"use client";

import { useMemo, useState } from "react";
import KpiCards from "@/components/KpiCards";
import SectionHeader from "@/components/SectionHeader";
import Segmented from "@/components/Segmented";
import TrendChart from "@/components/TrendChart";
import DataTable, { type Col } from "@/components/DataTable";
import Callout from "@/components/Callout";
import StatGrid from "@/components/StatGrid";
import { useJson } from "./ctx";
import { useTheme } from "@/lib/theme";
import { fmtByUnit, fmtDayFull, fmtInr, fmtInt, fmtPct } from "@/lib/format";
import type { ForecastSeries, MlBundle, TabCtx } from "@/lib/types";

const OPTS = [
  { value: "conversions", label: "Registrations", unit: "count" },
  { value: "gtv", label: "GTV", unit: "rupee" },
  { value: "landed", label: "Landed", unit: "count" },
  { value: "spend", label: "Spend", unit: "rupee" },
];

export default function ForecastTab({ ctx }: { ctx: TabCtx }) {
  const { data, loading, error } = useJson<MlBundle & { error?: string }>("/api/ml");
  const { theme } = useTheme();
  const [metric, setMetric] = useState("conversions");

  const f: ForecastSeries | null = useMemo(() => {
    if (!data || data.error) return null;
    return data.forecasts.find((x) => x.metric === metric) ?? null;
  }, [data, metric]);

  const series = useMemo(() => {
    if (!f) return [];
    // Keep history and forecast in one array so the chart draws a continuous x axis;
    // the two are separate keys so the forecast renders as its own dashed line.
    const hist = f.history.map((h) => ({
      c_date: h.date,
      actual: h.actual,
      fitted: h.fitted,
      yhat: null as number | null,
      lo: null as number | null,
      hi: null as number | null,
    }));
    const last = f.history[f.history.length - 1];
    const bridge = last
      ? [{ c_date: last.date, actual: last.actual, fitted: last.fitted, yhat: last.actual, lo: last.actual, hi: last.actual }]
      : [];
    const fc = f.forecast.map((x) => ({
      c_date: x.date,
      actual: null as number | null,
      fitted: null as number | null,
      yhat: x.yhat,
      lo: x.lo,
      hi: x.hi,
    }));
    return [...hist.slice(0, -1), ...bridge, ...fc];
  }, [f]);

  if (loading) return <div className="skel" style={{ height: 340 }} />;
  if (error)
    return (
      <Callout tone="crit" title="Could not reach the model service">
        {error}
      </Callout>
    );
  if (data?.error === "MODEL_NOT_TRAINED")
    return (
      <Callout tone="warn" title="Projection unavailable">
        The projection is not available yet. Every other tab is unaffected.
      </Callout>
    );
  if (!f) return <div className="empty">No forecast available for that metric.</div>;

  const unit = OPTS.find((o) => o.value === metric)?.unit ?? "count";
  const remaining = f.projected_total - f.season_to_date;
  const beatsNaive = f.backtest.mape < f.baseline_mape.seasonal_naive;
  const lastFc = f.forecast[f.forecast.length - 1];

  const kpis = [
    { label: "Season to date", value: fmtByUnit(f.season_to_date, unit), delta: null, dir: "neu" as const },
    {
      label: "Projected at race day",
      value: fmtByUnit(f.projected_total, unit),
      delta: null,
      dir: "neu" as const,
      note: "+" + fmtByUnit(remaining, unit) + " still to come",
    },
    {
      label: "Backtest MAPE",
      value: fmtPct(f.backtest.mape, 2),
      delta: null,
      dir: "cost" as const,
      note: f.backtest.folds + " rolling folds, 7-day horizon",
    },
    {
      label: "Seasonal-naive MAPE",
      value: fmtPct(f.baseline_mape.seasonal_naive, 2),
      delta: null,
      dir: "cost" as const,
      note: beatsNaive ? "model wins" : "baseline wins",
    },
  ];

  const foldCols: Col<{ k: string; v: string }>[] = [
    { key: "k", label: "Measure", get: (r) => r.k },
    { key: "v", label: "Value", get: (r) => r.v, align: "right" },
  ];

  return (
    <div className="stack">
      <div className="row">
        <Segmented options={OPTS} value={metric} onChange={setMetric} />
      </div>

      <KpiCards items={kpis} />

      <div className="sec">
        <SectionHeader
          title="Actuals, fit and projection to race day"
          sub="Solid is actual, faint is the in-sample fit, dashed is the forecast with a 95% prediction band"
        />
        <div className="panel">
          <TrendChart
            data={series}
            bands={[{ loKey: "lo", hiKey: "hi", label: "95% interval", color: theme.ACCENT }]}
            lines={[
              { key: "actual", label: "Actual", unit, color: theme.INK2 },
              { key: "fitted", label: "Fitted", unit, color: theme.MUTED, dashed: true },
              { key: "yhat", label: "Forecast", unit, color: theme.ACCENT, dashed: true },
            ]}
            height={330}
            caption={f.model}
          />
        </div>
      </div>

      <Callout tone={beatsNaive ? "good" : "warn"} title="What the projection is worth">
        The model projects {fmtByUnit(f.projected_total, unit)} by race day, of which{" "}
        {fmtByUnit(remaining, unit)} is still to come. On the final day the interval runs{" "}
        {fmtByUnit(lastFc.lo, unit)} to {fmtByUnit(lastFc.hi, unit)}. Rolling-origin
        backtesting over {f.backtest.folds} folds put its error at{" "}
        {fmtPct(f.backtest.mape, 2)} against {fmtPct(f.baseline_mape.seasonal_naive, 2)} for
        a seasonal-naive baseline and {fmtPct(f.baseline_mape.drift, 2)} for a drift
        baseline
        {beatsNaive
          ? ", so the specification is earning its complexity here."
          : ", so on this metric the naive baseline is as good — the model is not adding value and should not be quoted as if it were."}{" "}
        The band is a residual-based prediction interval: it describes how wrong this model
        has been historically, not everything that could happen.
      </Callout>

      <div className="grid-2">
        <div>
          <SectionHeader title="Backtest detail" sub="Refit at each origin and recursed forward, exactly as the live forecast runs" />
          <div className="panel">
            <StatGrid
              cols={2}
              items={[
                { label: "MAPE", value: fmtPct(f.backtest.mape, 2) },
                { label: "sMAPE", value: fmtPct(f.backtest.smape, 2) },
                { label: "RMSE", value: fmtInt(f.backtest.rmse) },
                { label: "Folds", value: String(f.backtest.folds) },
              ]}
            />
            <div className="tbl-cap" style={{ marginTop: 10 }}>
              A {fmtPct(f.backtest.mape, 1)} error on a day of{" "}
              {fmtByUnit(f.season_to_date / Math.max(1, f.history.length), unit)} means being
              out by roughly{" "}
              {fmtByUnit(
                (f.backtest.mape / 100) * (f.season_to_date / Math.max(1, f.history.length)),
                unit
              )}{" "}
              on a typical day.
            </div>
          </div>
        </div>
        <div>
          <SectionHeader title="Day by day to race day" sub="Point forecast with the interval" />
          <div className="panel">
            <div className="tbl-wrap">
              <table className="tbl dense">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="r">Low</th>
                    <th className="r">Forecast</th>
                    <th className="r">High</th>
                  </tr>
                </thead>
                <tbody>
                  {f.forecast.map((x) => (
                    <tr key={x.date}>
                      <td>{fmtDayFull(x.date)}</td>
                      <td className="r muted">{fmtByUnit(x.lo, unit)}</td>
                      <td className="r">{fmtByUnit(x.yhat, unit)}</td>
                      <td className="r muted">{fmtByUnit(x.hi, unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="sec">
        <SectionHeader title="All four metrics" sub="Same specification, fitted independently per series" />
        <div className="panel">
          <div className="tbl-wrap">
            <table className="tbl dense">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className="r">Season to date</th>
                  <th className="r">Projected</th>
                  <th className="r">Model MAPE</th>
                  <th className="r">Seasonal-naive</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {data?.forecasts.map((s) => {
                  const u = OPTS.find((o) => o.value === s.metric)?.unit ?? "count";
                  const win = s.backtest.mape < s.baseline_mape.seasonal_naive;
                  return (
                    <tr key={s.metric}>
                      <td>{OPTS.find((o) => o.value === s.metric)?.label ?? s.metric}</td>
                      <td className="r">{fmtByUnit(s.season_to_date, u)}</td>
                      <td className="r">{fmtByUnit(s.projected_total, u)}</td>
                      <td className="r">{fmtPct(s.backtest.mape, 2)}</td>
                      <td className="r muted">{fmtPct(s.baseline_mape.seasonal_naive, 2)}</td>
                      <td>
                        <span className={win ? "badge badge-good" : "badge badge-warn"}>
                          {win ? "beats naive" : "no better than naive"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
