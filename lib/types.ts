// Shared contracts for RunPulse Analytics.
//
// One rule holds the whole app together: every tab receives the same TabCtx and
// derives what it needs with the helpers in lib/data.ts. Nothing fetches on its own.

/** One row of the funnel table: long format, one row per day x level x entity. */
export interface Row {
  c_date: string; // YYYY-MM-DD
  level: string;
  channel: string;
  entity: string;
  parent: string;
  landed: number;
  lead_submitted: number;
  pay_now_attempt: number;
  conversions: number;
  gtv: number;
  spend: number;
  /** parsed out of `entity` on the *_city levels, else null */
  _city: string | null;
}

export interface Totals {
  landed: number;
  lead_submitted: number;
  pay_now_attempt: number;
  conversions: number;
  gtv: number;
  spend: number;
}

/** Totals plus every derived ratio, computed once so no component divides by hand. */
export interface Derived extends Totals {
  L2L: number | null; // landed -> lead %
  L2P: number | null; // lead -> pay %
  P2C: number | null; // pay -> conversion %
  L2C: number | null; // landed -> conversion %
  ROAS: number | null;
  CPL: number | null;
  CPA: number | null;
  AOV: number | null;
}

export interface DailyRow extends Derived {
  c_date: string;
}
export interface EntityRow extends Derived {
  entity: string;
  parent?: string;
  channel?: string;
}

/** How to colour a delta. "good" = up is green. "cost" = up is red. "neu" = no judgement. */
export type Dir = "good" | "neu" | "cost";
export type Unit = "count" | "rupee" | "pct" | "ratio";

export interface KpiItem {
  label: string;
  value: string;
  delta: number | null;
  dir: Dir;
  sub?: string;
  note?: string;
}

export type Flag = "DEAD" | "DOWN_BIG" | "DOWN" | "UP" | "FLAT" | "NA";

export interface MoverRow {
  entity: string;
  level: string;
  cur: number;
  base: number;
  delta: number;
  pct: number | null;
  flag: Flag;
}

// --- channel detail tables -------------------------------------------------
export interface MetaRow {
  date: string;
  campaign_name: string;
  adset_name: string;
  creative: string;
  creative_type: string;
  objective: string;
  city: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  landed: number;
  lead_submitted: number;
  pay_now_attempt: number;
  conversions: number;
  gtv: number;
}

export interface GoogleRow {
  date: string;
  campaign_name: string;
  campaign_type: string;
  city: string;
  spend: number;
  impressions: number;
  clicks: number;
  landed: number;
  lead_submitted: number;
  pay_now_attempt: number;
  conversions: number;
  gtv: number;
}

export interface LinkedInRow {
  date: string;
  campaign_name: string;
  audience: string;
  objective: string;
  city: string;
  spend: number;
  impressions: number;
  clicks: number;
  landed: number;
  lead_submitted: number;
  pay_now_attempt: number;
  conversions: number;
  gtv: number;
}

export interface PrintRow {
  date: string;
  publication: string;
  slot: string;
  city: string;
  spend: number;
  estimated_reach: number;
  landed: number;
  lead_submitted: number;
  pay_now_attempt: number;
  conversions: number;
  gtv: number;
}

// --- API payloads ----------------------------------------------------------
export interface DataPayload {
  rows: Row[];
  full_min: string;
  full_max: string;
  cities: string[];
  channels: string[];
  event_date: string;
  error?: string;
}

/** Everything a tab is allowed to see. Built once in app/page.tsx. */
export interface TabCtx {
  rows: Row[]; // date-filtered
  rowsFull: Row[]; // whole season, for baselines and trends
  start: string;
  end: string;
  mind: string;
  maxd: string;
  fullMin: string;
  fullMax: string;
  eventDate: string;
  city: string | null; // active city filter, null = all
}

// --- ML model artefacts (written by ml/train.py, read by lib/ml.ts) --------
export interface LogitModel {
  kind: "logistic_regression";
  target: string;
  intercept: number;
  /** numeric features, standardised: (x - mean) / scale */
  numeric: { name: string; mean: number; scale: number; coef: number }[];
  /** one-hot features; the dropped reference level is named for interpretability */
  categorical: { name: string; reference: string; levels: { value: string; coef: number }[] }[];
  metrics: {
    n_train: number;
    n_test: number;
    positive_rate: number;
    auc: number;
    average_precision: number;
    brier: number;
    log_loss: number;
    threshold: number;
    precision: number;
    recall: number;
    f1: number;
    confusion: { tn: number; fp: number; fn: number; tp: number };
  };
  calibration: { bin: number; predicted: number; actual: number; n: number }[];
  top_effects: { feature: string; coef: number; odds_ratio: number }[];
  baseline: { name: string; auc: number; average_precision: number }[];
}

export interface ForecastSeries {
  metric: string;
  history: { date: string; actual: number; fitted: number }[];
  forecast: { date: string; yhat: number; lo: number; hi: number }[];
  backtest: { mape: number; smape: number; rmse: number; folds: number };
  baseline_mape: { seasonal_naive: number; drift: number };
  season_to_date: number;
  projected_total: number;
  model: string;
}

export interface ResponseCurve {
  channel: string;
  /** conversions = a * spend^b, fitted in log space */
  a: number;
  b: number;
  r2: number;
  n_days: number;
  current_daily_spend: number;
  current_daily_conv: number;
  marginal_cpa: number;
  average_cpa: number;
  aov: number;
  saturation_index: number; // 1 - b, how fast returns are diminishing
}

export interface Reallocation {
  total_daily_budget: number;
  baseline_conversions: number;
  optimised_conversions: number;
  lift_pct: number;
  moves: { channel: string; from: number; to: number; delta: number; delta_pct: number }[];
}

export interface AnomalyRow {
  date: string;
  scope: string;
  metric: string;
  value: number;
  median: number;
  mad_z: number;
  direction: "spike" | "drop";
  note: string;
}

export interface MlBundle {
  generated_at: string;
  seed: number;
  propensity: LogitModel;
  lead_propensity: LogitModel;
  forecasts: ForecastSeries[];
  curves: ResponseCurve[];
  reallocation: Reallocation;
  anomalies: AnomalyRow[];
  dataset: { sessions: number; funnel_rows: number; season_days: number };
}
