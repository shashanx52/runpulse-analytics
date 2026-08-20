"use client";

import { useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import StatGrid from "@/components/StatGrid";
import Callout from "@/components/Callout";
import TrendChart from "@/components/TrendChart";
import DataTable, { type Col } from "@/components/DataTable";
import Segmented from "@/components/Segmented";
import { useJson } from "./ctx";
import { useTheme } from "@/lib/theme";
import { curveSweep, liftTable, marginalCpaAt, scoreLogit, type FeatureInput } from "@/lib/ml";
import { CHANNEL_LABEL } from "@/lib/constants";
import { fmtInr, fmtInt, fmtPct, fmtRatio } from "@/lib/format";
import type { LogitModel, MlBundle, ResponseCurve, TabCtx } from "@/lib/types";

function ModelCard({ m, title }: { m: LogitModel; title: string }) {
  const win = m.metrics.auc >= (m.baseline[0]?.auc ?? 0);
  return (
    <div className="panel">
      <div className="sec-t" style={{ marginBottom: 10 }}>
        {title}
      </div>
      <StatGrid
        cols={4}
        items={[
          { label: "ROC AUC", value: m.metrics.auc.toFixed(4), note: "held out, later dates" },
          { label: "Avg precision", value: m.metrics.average_precision.toFixed(4), note: "base rate " + fmtPct(m.metrics.positive_rate * 100, 2) },
          { label: "Brier", value: m.metrics.brier.toFixed(4), note: "lower is better" },
          { label: "Log loss", value: m.metrics.log_loss.toFixed(4) },
          { label: "Precision", value: fmtPct(m.metrics.precision * 100, 1), note: "at threshold " + m.metrics.threshold.toFixed(2) },
          { label: "Recall", value: fmtPct(m.metrics.recall * 100, 1) },
          { label: "F1", value: m.metrics.f1.toFixed(3) },
          { label: "Train / test", value: fmtInt(m.metrics.n_train) + " / " + fmtInt(m.metrics.n_test) },
        ]}
      />
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div>
          <div className="stat-l" style={{ marginBottom: 6 }}>Confusion matrix at the chosen threshold</div>
          <div className="tbl-wrap">
            <table className="tbl dense">
              <thead>
                <tr>
                  <th />
                  <th className="r">Predicted no</th>
                  <th className="r">Predicted yes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Actual no</td>
                  <td className="r">{fmtInt(m.metrics.confusion.tn)}</td>
                  <td className="r warn">{fmtInt(m.metrics.confusion.fp)}</td>
                </tr>
                <tr>
                  <td>Actual yes</td>
                  <td className="r crit">{fmtInt(m.metrics.confusion.fn)}</td>
                  <td className="r good">{fmtInt(m.metrics.confusion.tp)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <div className="stat-l" style={{ marginBottom: 6 }}>Against the baselines</div>
          <div className="tbl-wrap">
            <table className="tbl dense">
              <thead>
                <tr>
                  <th>Model</th>
                  <th className="r">AUC</th>
                  <th className="r">Avg precision</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Logistic regression</strong>
                  </td>
                  <td className="r">
                    <strong>{m.metrics.auc.toFixed(4)}</strong>
                  </td>
                  <td className="r">
                    <strong>{m.metrics.average_precision.toFixed(4)}</strong>
                  </td>
                </tr>
                {m.baseline.map((b) => (
                  <tr key={b.name}>
                    <td className="muted">{b.name}</td>
                    <td className="r muted">{b.auc.toFixed(4)}</td>
                    <td className="r muted">{b.average_precision.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tbl-cap">
            {win
              ? "Logistic regression matched or beat gradient boosting here, so the simpler, inspectable model is the right one to ship."
              : "Gradient boosting scored higher. Logistic regression is kept because its coefficients are readable and it exports to a few hundred bytes of JSON, but the gap is real and should be stated."}
          </div>
        </div>
      </div>
    </div>
  );
}

function Scorer({ m }: { m: LogitModel }) {
  const [inp, setInp] = useState<FeatureInput>(() => {
    const o: FeatureInput = {};
    for (const n of m.numeric) o[n.name] = Math.round(n.mean);
    for (const c of m.categorical) o[c.name] = c.reference;
    return o;
  });

  const p = scoreLogit(m, inp);
  const lift = liftTable(m);
  const base = m.metrics.positive_rate;
  const rel = base > 0 ? p / base : 0;

  return (
    <div className="panel">
      <div className="grid-2">
        <div>
          <div className="stat-l" style={{ marginBottom: 8 }}>Session features</div>
          <div className="stack" style={{ gap: 8 }}>
            {m.categorical.map((c) => (
              <label key={c.name} className="row" style={{ gap: 8 }}>
                <span className="muted" style={{ minWidth: 110, fontSize: 12 }}>
                  {c.name.replace(/_/g, " ")}
                </span>
                <select
                  className="inp"
                  value={String(inp[c.name])}
                  onChange={(e) => setInp({ ...inp, [c.name]: e.target.value })}
                >
                  <option value={c.reference}>{c.reference} (reference)</option>
                  {c.levels.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.value}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {m.numeric.map((n) => (
              <label key={n.name} className="row" style={{ gap: 8 }}>
                <span className="muted" style={{ minWidth: 110, fontSize: 12 }}>
                  {n.name.replace(/_/g, " ")}
                </span>
                <input
                  type="number"
                  className="inp"
                  style={{ width: 110 }}
                  value={Number(inp[n.name])}
                  onChange={(e) => setInp({ ...inp, [n.name]: Number(e.target.value) })}
                />
                <span className="muted" style={{ fontSize: 11 }}>
                  mean {n.mean.toFixed(1)}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <div className="stat-l" style={{ marginBottom: 8 }}>Prediction</div>
          <div className="kpi" style={{ marginBottom: 10 }}>
            <div className="kpi-l">Probability of registering</div>
            <div className="kpi-v accent">{fmtPct(p * 100, 2)}</div>
            <div className="kpi-note">
              base rate {fmtPct(base * 100, 2)} · {rel.toFixed(2)}× the average session
            </div>
          </div>
          <div className="tbl-cap">
            Scored live from the fitted coefficients — this is the model itself, not an
            approximation of it.
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="stat-l" style={{ marginBottom: 6 }}>Gain and lift by decile</div>
            <div className="tbl-wrap">
              <table className="tbl dense">
                <thead>
                  <tr>
                    <th className="r">Decile</th>
                    <th className="r">Predicted</th>
                    <th className="r">Actual</th>
                    <th className="r">Lift</th>
                    <th className="r">Cum. share of registrations</th>
                  </tr>
                </thead>
                <tbody>
                  {lift.map((r) => (
                    <tr key={r.decile}>
                      <td className="r">{r.decile}</td>
                      <td className="r muted">{fmtPct(r.predicted * 100, 2)}</td>
                      <td className="r">{fmtPct(r.actual * 100, 2)}</td>
                      <td className="r">{r.lift.toFixed(2)}×</td>
                      <td className="r">{fmtPct(r.cumShare, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MlTab({ ctx }: { ctx: TabCtx }) {
  const { data, loading, error } = useJson<MlBundle & { error?: string }>("/api/ml");
  const { theme } = useTheme();
  const [curveCh, setCurveCh] = useState<string | null>(null);

  const curves = data?.curves ?? [];
  const active: ResponseCurve | null = useMemo(() => {
    if (!curves.length) return null;
    return curves.find((c) => c.channel === curveCh) ?? curves[0];
  }, [curves, curveCh]);

  const sweep = useMemo(() => {
    if (!active) return [];
    return curveSweep(active).map((p) => ({
      c_date: Math.round(p.spend / 1000) + "k",
      conversions: p.conversions,
      marginal: marginalCpaAt(active, p.spend),
    }));
  }, [active]);

  if (loading) return <div className="skel" style={{ height: 380 }} />;
  if (error)
    return (
      <Callout tone="crit" title="Could not reach the model service">
        {error}
      </Callout>
    );
  if (data?.error === "MODEL_NOT_TRAINED")
    return (
      <Callout tone="warn" title="Model results unavailable">
        The model results are not available yet.
      </Callout>
    );
  if (!data) return <div className="empty">No model bundle available.</div>;

  const p = data.propensity;
  const top = p.top_effects.slice(0, 12);
  const effects = top.map((e) => ({ c_date: e.feature, coef: e.coef }));
  const realloc = data.reallocation;

  const curveCols: Col<ResponseCurve>[] = [
    { key: "ch", label: "Channel", get: (r) => CHANNEL_LABEL[r.channel] ?? r.channel },
    { key: "b", label: "Elasticity b", get: (r) => r.b, fmt: (v) => (v as number).toFixed(3), align: "right" },
    { key: "r2", label: "R²", get: (r) => r.r2, fmt: (v) => (v as number).toFixed(3), align: "right" },
    { key: "n", label: "Days", get: (r) => r.n_days, align: "right" },
    { key: "sp", label: "Daily spend", get: (r) => r.current_daily_spend, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "cv", label: "Daily regs", get: (r) => r.current_daily_conv, fmt: (v) => (v as number).toFixed(1), align: "right" },
    { key: "acpa", label: "Average CPA", get: (r) => r.average_cpa, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "mcpa", label: "Marginal CPA", get: (r) => r.marginal_cpa, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "sat", label: "Saturation", get: (r) => r.saturation_index, fmt: (v) => (v as number).toFixed(3), align: "right" },
  ];

  const moveCols: Col<(typeof realloc.moves)[number]>[] = [
    { key: "ch", label: "Channel", get: (r) => CHANNEL_LABEL[r.channel] ?? r.channel },
    { key: "from", label: "Now", get: (r) => r.from, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "to", label: "Recommended", get: (r) => r.to, fmt: (v) => fmtInr(v as number), align: "right" },
    {
      key: "d",
      label: "Change",
      get: (r) => r.delta,
      fmt: (v) => ((v as number) > 0 ? "+" : "") + fmtInr(v as number),
      align: "right",
    },
    {
      key: "dp",
      label: "%",
      get: (r) => r.delta_pct,
      fmt: (v) => ((v as number) > 0 ? "+" : "") + fmtPct(v as number),
      align: "right",
    },
  ];

  const lowConf = curves.filter((c) => c.r2 < 0.25);

  return (
    <div className="stack">
      <Callout tone="info" title="How to read this">
        Every figure below is measured on held-out data, split by date rather than at
        random. A random split would put sessions from the same day on both sides and
        inflate every score, so the models are always scored on a period they were never
        trained on.
      </Callout>

      <div className="sec">
        <SectionHeader title="Conversion propensity" sub="Will this session end in a registration?" />
        <ModelCard m={p} title="Logistic regression · target: converted" />
      </div>

      <div className="sec">
        <SectionHeader
          title="Calibration"
          sub="Predicted probability against observed rate by decile. A well-calibrated model sits on the diagonal — AUC alone would not show this"
        />
        <div className="panel">
          <TrendChart
            data={p.calibration.map((c) => ({
              c_date: String(c.bin),
              predicted: c.predicted * 100,
              actual: c.actual * 100,
            }))}
            lines={[
              { key: "predicted", label: "Predicted", unit: "pct", color: theme.MUTED, dashed: true },
              { key: "actual", label: "Observed", unit: "pct", color: theme.ACCENT },
            ]}
            height={250}
            caption="x axis is the decile of predicted probability, lowest to highest."
          />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Largest effects"
          sub="Standardised coefficients, so numeric and categorical terms are on a comparable scale"
        />
        <div className="panel">
          <TrendChart
            data={effects}
            bars={[{ key: "coef", label: "Coefficient", unit: "ratio" }]}
            height={280}
          />
          <div className="tbl-wrap" style={{ marginTop: 12 }}>
            <table className="tbl dense">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th className="r">Coefficient</th>
                  <th className="r">Odds ratio</th>
                  <th>Reading</th>
                </tr>
              </thead>
              <tbody>
                {top.map((e) => (
                  <tr key={e.feature}>
                    <td>{e.feature.replace(/_/g, " ")}</td>
                    <td className="r">{e.coef.toFixed(4)}</td>
                    <td className="r">{e.odds_ratio.toFixed(3)}</td>
                    <td className="muted">
                      {e.coef > 0
                        ? "raises the odds " + ((e.odds_ratio - 1) * 100).toFixed(0) + "%"
                        : "lowers the odds " + ((1 - e.odds_ratio) * 100).toFixed(0) + "%"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Score a session"
          sub="Change any feature and the prediction updates from the exported coefficients"
        />
        <Scorer m={p} />
      </div>

      <div className="sec">
        <SectionHeader
          title="Budget response curves"
          sub="Registrations against spend, fitted per channel while holding trend, race-day proximity and day of week constant"
          right={
            <Segmented
              options={curves.map((c) => ({ value: c.channel, label: CHANNEL_LABEL[c.channel] ?? c.channel }))}
              value={active?.channel ?? ""}
              onChange={setCurveCh}
              size="sm"
            />
          }
        />
        <div className="panel">
          {active ? (
            <>
              <StatGrid
                cols={4}
                items={[
                  { label: "Elasticity", value: active.b.toFixed(3), note: "1.0 would be constant returns" },
                  { label: "R-squared", value: active.r2.toFixed(3), note: active.r2 < 0.25 ? "too weak to act on" : "usable" },
                  { label: "Average CPA", value: fmtInr(active.average_cpa), note: "money already spent" },
                  { label: "Marginal CPA", value: fmtInr(active.marginal_cpa), note: "cost of the next registration" },
                ]}
              />
              <div style={{ marginTop: 12 }}>
                <TrendChart
                  data={sweep}
                  lines={[
                    { key: "conversions", label: "Registrations per day", unit: "count", color: theme.ACCENT },
                    { key: "marginal", label: "Marginal CPA", unit: "rupee", yAxis: "right", color: theme.WARN, dashed: true },
                  ]}
                  height={270}
                  caption={
                    "Swept from 20% to 250% of current spend (" +
                    fmtInr(active.current_daily_spend) +
                    "/day). Rising marginal CPA is the curve flattening."
                  }
                />
              </div>
            </>
          ) : null}
          <div style={{ marginTop: 14 }}>
            <DataTable rows={curves} cols={curveCols} sortKey="sp" dense />
          </div>
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Reallocation optimiser"
          sub="Same total daily budget, moved to equalise marginal cost per registration"
        />
        <div className="panel">
          <StatGrid
            cols={4}
            items={[
              { label: "Daily budget", value: fmtInr(realloc.total_daily_budget), note: "held fixed" },
              { label: "Registrations now", value: realloc.baseline_conversions.toFixed(1) + "/day" },
              { label: "Optimised", value: realloc.optimised_conversions.toFixed(1) + "/day" },
              { label: "Lift", value: fmtPct(realloc.lift_pct, 1), note: "same money" },
            ]}
          />
          <div style={{ marginTop: 12 }}>
            <DataTable rows={realloc.moves} cols={moveCols} sortKey="d" dense />
          </div>
        </div>
      </div>

      <Callout tone="warn" title="Read the optimiser with this caveat attached">
        It recommends{" "}
        {realloc.moves
          .filter((m) => Math.abs(m.delta_pct) > 1)
          .map((m) => (m.delta > 0 ? "growing " : "cutting ") + (CHANNEL_LABEL[m.channel] ?? m.channel) + " " + Math.abs(Math.round(m.delta_pct)) + "%")
          .join(", ")}
        , for {fmtPct(realloc.lift_pct, 1)} more registrations per day on the same budget.
        These curves are fitted on observational spend, not on an experiment, so they show
        association and cannot prove causation — the channels were never randomised. Each
        move is also capped at 20–250% of current spend, because bidding and creative both
        need time to re-learn and a channel taken to zero loses its audience data.
        {lowConf.length
          ? " " +
            lowConf.map((c) => CHANNEL_LABEL[c.channel] ?? c.channel).join(" and ") +
            " fit too poorly (R² below 0.25) to be trusted with more budget, so the optimiser is not allowed to grow " +
            (lowConf.length > 1 ? "them" : "it") +
            "."
          : ""}
      </Callout>

      <div className="sec">
        <SectionHeader title="Lead propensity" sub="The same treatment on the earlier funnel step" />
        <ModelCard m={data.lead_propensity} title="Logistic regression · target: lead_submitted" />
      </div>

    </div>
  );
}
