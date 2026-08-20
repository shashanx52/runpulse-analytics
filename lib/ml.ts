// Scoring for the models trained in ml/train.py.
//
// The training script exports coefficients rather than a pickled estimator, so the
// running app scores in TypeScript and never needs Python. train.py asserts that this
// arithmetic reproduces sklearn's predict_proba to 1e-9 on held-out rows, which is the
// only reason the interactive scorer in the ML tab can be trusted.

import type { LogitModel, ResponseCurve } from "./types";

export type FeatureInput = Record<string, number | string>;

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

export function linearPredictor(model: LogitModel, input: FeatureInput): number {
  let z = model.intercept;
  for (const f of model.numeric) {
    const raw = Number(input[f.name] ?? f.mean); // a missing numeric sits at the mean
    z += ((raw - f.mean) / f.scale) * f.coef;
  }
  for (const c of model.categorical) {
    const v = String(input[c.name] ?? c.reference);
    const hit = c.levels.find((l) => l.value === v);
    // No match means either the reference level or a value the model never saw. Both
    // contribute nothing, so an unseen city scores as the reference city rather than
    // throwing — wrong in a knowable direction beats failing.
    if (hit) z += hit.coef;
  }
  return z;
}

export const scoreLogit = (model: LogitModel, input: FeatureInput): number =>
  sigmoid(linearPredictor(model, input));

/** which calibration decile a probability falls into, 1 = lowest */
export function decile(model: LogitModel, p: number): number {
  const bins = model.calibration;
  if (!bins.length) return 1;
  for (const b of bins) if (p <= b.predicted) return b.bin;
  return bins[bins.length - 1].bin;
}

export interface LiftRow {
  decile: number;
  n: number;
  predicted: number;
  actual: number;
  cumActual: number;
  cumShare: number;
  lift: number;
}

/**
 * Gain and lift from the exported calibration bins, highest-scoring decile first.
 *
 * lift is the decile's own rate over the base rate; cumShare is the share of all
 * positives captured by targeting down to that decile — the number a campaign manager
 * actually uses when deciding how deep to mail.
 */
export function liftTable(model: LogitModel): LiftRow[] {
  const bins = [...model.calibration].sort((a, b) => b.predicted - a.predicted);
  const totalPos = bins.reduce((a, b) => a + b.actual * b.n, 0);
  const totalN = bins.reduce((a, b) => a + b.n, 0);
  const base = totalN > 0 ? totalPos / totalN : 0;
  let cum = 0;
  return bins.map((b, i) => {
    cum += b.actual * b.n;
    return {
      decile: i + 1,
      n: b.n,
      predicted: b.predicted,
      actual: b.actual,
      cumActual: cum,
      cumShare: totalPos > 0 ? (cum / totalPos) * 100 : 0,
      lift: base > 0 ? b.actual / base : 0,
    };
  });
}

export const oddsRatio = (coef: number): number => Math.exp(coef);

// --- response curves -------------------------------------------------------
export const conversionsAt = (c: ResponseCurve, spend: number): number =>
  c.a * Math.pow(Math.max(spend, 1), c.b);

/** cost of the NEXT registration at this spend, which is what a budget decision needs */
export function marginalCpaAt(c: ResponseCurve, spend: number): number {
  const d = c.a * c.b * Math.pow(Math.max(spend, 1), c.b - 1);
  return d > 1e-12 ? 1 / d : Infinity;
}

export const averageCpaAt = (c: ResponseCurve, spend: number): number => {
  const conv = conversionsAt(c, spend);
  return conv > 0 ? spend / conv : Infinity;
};

/** points for plotting a curve from 20% to 250% of its current operating point */
export function curveSweep(c: ResponseCurve, steps = 26): { spend: number; conversions: number }[] {
  const lo = c.current_daily_spend * 0.2;
  const hi = c.current_daily_spend * 2.5;
  const out: { spend: number; conversions: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = lo + ((hi - lo) * i) / steps;
    out.push({ spend: s, conversions: conversionsAt(c, s) });
  }
  return out;
}
