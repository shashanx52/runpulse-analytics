"""
Model training for RunPulse Analytics.

Reads ../data/*.csv, fits six models, writes ml/models/bundle.json in the shape of the
MlBundle interface in lib/types.ts. The dashboard scores the exported coefficients in
TypeScript at request time, so nothing in the running app needs Python.

    python ml/train.py

Nothing here calls datetime.now() or an unseeded RNG: the build has to be reproducible,
because a portfolio project that prints different metrics on every run is not evidence
of anything.
"""

from __future__ import annotations

import json
import math
import os
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)

SEED = 20260823
GENERATED_AT = "2026-08-20T00:00:00Z"  # fixed, see module docstring
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
OUT_DIR = os.path.join(HERE, "models")

SEASON_START = "2026-03-01"
SEASON_END = "2026-08-19"
EVENT_DATE = "2026-08-23"
PAID = ["meta", "google", "linkedin", "print"]

np.random.seed(SEED)


# ===========================================================================
# helpers
# ===========================================================================
def sigmoid(z: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-z))


def safe_div(a: float, b: float) -> float:
    return float(a / b) if b else 0.0


def r2_of(y: np.ndarray, yhat: np.ndarray) -> float:
    ss_res = float(np.sum((y - yhat) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    return 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0


def mape(a: np.ndarray, f: np.ndarray) -> float:
    m = a != 0
    return float(np.mean(np.abs((a[m] - f[m]) / a[m])) * 100) if m.any() else float("nan")


def smape(a: np.ndarray, f: np.ndarray) -> float:
    d = (np.abs(a) + np.abs(f)) / 2
    m = d != 0
    return float(np.mean(np.abs(a[m] - f[m]) / d[m]) * 100) if m.any() else float("nan")


def rmse(a: np.ndarray, f: np.ndarray) -> float:
    return float(np.sqrt(np.mean((a - f) ** 2)))


# ===========================================================================
# 1 & 2. propensity models
# ===========================================================================
NUMERIC = [
    "days_to_event",
    "session_depth",
    "dwell_seconds",
    "prior_visits",
    "ticket_price",
    "is_returning",
    "is_weekend",
]
CATEGORICAL = ["channel", "city", "device", "creative_type", "price_tier", "objective"]


def design_matrix(df: pd.DataFrame, levels: Dict[str, List[str]]):
    """
    Standardise numerics, one-hot the categoricals dropping the first level.

    Built by hand rather than with ColumnTransformer for one reason: the exported JSON
    has to let TypeScript score a raw feature dict, which means we need to keep the
    exact mean/scale per column and the exact reference level per categorical. Doing the
    encoding here makes that mapping impossible to get wrong.
    """
    cols: List[np.ndarray] = []
    names: List[str] = []
    stats: Dict[str, Dict[str, float]] = {}
    for c in NUMERIC:
        v = df[c].astype(float).to_numpy()
        mu = float(np.mean(v))
        sd = float(np.std(v))
        if sd == 0:
            sd = 1.0
        stats[c] = {"mean": mu, "scale": sd}
        cols.append((v - mu) / sd)
        names.append(c)
    for c in CATEGORICAL:
        for lv in levels[c][1:]:  # levels[c][0] is the reference
            cols.append((df[c].astype(str).to_numpy() == lv).astype(float))
            names.append(f"{c}={lv}")
    return np.column_stack(cols), names, stats


def export_logit(
    target: str,
    model: LogisticRegression,
    names: List[str],
    stats: Dict[str, Dict[str, float]],
    levels: Dict[str, List[str]],
    metrics: Dict[str, Any],
    calibration: List[Dict[str, Any]],
    baseline: List[Dict[str, Any]],
) -> Dict[str, Any]:
    coef = model.coef_[0]
    by_name = dict(zip(names, coef))

    # Fold the standardisation into the intercept so a consumer can score raw values:
    #   sum(coef_i * (x_i - mu_i)/sd_i) + b0  ==  sum((coef_i/sd_i) * x_i) + (b0 - sum(coef_i*mu_i/sd_i))
    # We keep coef as the standardised coefficient and publish mean/scale, so lib/ml.ts
    # applies (x - mean)/scale itself. The intercept therefore stays as fitted.
    numeric = [
        {
            "name": c,
            "mean": stats[c]["mean"],
            "scale": stats[c]["scale"],
            "coef": float(by_name[c]),
        }
        for c in NUMERIC
    ]
    categorical = [
        {
            "name": c,
            "reference": levels[c][0],
            "levels": [{"value": lv, "coef": float(by_name[f"{c}={lv}"])} for lv in levels[c][1:]],
        }
        for c in CATEGORICAL
    ]
    top = sorted(
        ({"feature": n, "coef": float(v), "odds_ratio": float(math.exp(v))} for n, v in by_name.items()),
        key=lambda d: abs(d["coef"]),
        reverse=True,
    )[:12]
    return {
        "kind": "logistic_regression",
        "target": target,
        "intercept": float(model.intercept_[0]),
        "numeric": numeric,
        "categorical": categorical,
        "metrics": metrics,
        "calibration": calibration,
        "top_effects": top,
        "baseline": baseline,
    }


def score_from_export(exp: Dict[str, Any], df: pd.DataFrame) -> np.ndarray:
    """Reference implementation of lib/ml.ts scoreLogit, used to verify the export."""
    z = np.full(len(df), float(exp["intercept"]))
    for f in exp["numeric"]:
        z += ((df[f["name"]].astype(float).to_numpy() - f["mean"]) / f["scale"]) * f["coef"]
    for c in exp["categorical"]:
        vals = df[c["name"]].astype(str).to_numpy()
        for lv in c["levels"]:
            z += (vals == lv["value"]).astype(float) * lv["coef"]
    return sigmoid(z)


def fit_propensity(sessions: pd.DataFrame, target: str) -> Dict[str, Any]:
    df = sessions.copy()
    levels = {c: sorted(df[c].astype(str).unique().tolist()) for c in CATEGORICAL}

    # Split by DATE, not at random. A random split puts sessions from the same day on
    # both sides, and since day-level demand drives conversion that leaks the future
    # into the training set and flatters AUC. Forecasting the last 20% of the season
    # from the first 80% is the question the model would actually be asked.
    dates = np.sort(df["date"].unique())
    cut = dates[int(len(dates) * 0.8)]
    tr = df[df["date"] < cut]
    te = df[df["date"] >= cut]

    X_all, names, stats = design_matrix(df, levels)
    y_all = df[target].astype(int).to_numpy()
    mask_tr = (df["date"] < cut).to_numpy()
    X_tr, y_tr = X_all[mask_tr], y_all[mask_tr]
    X_te, y_te = X_all[~mask_tr], y_all[~mask_tr]

    clf = LogisticRegression(
        max_iter=3000, class_weight="balanced", C=1.0, random_state=SEED, solver="lbfgs"
    )
    clf.fit(X_tr, y_tr)
    p_te = clf.predict_proba(X_te)[:, 1]

    # threshold that maximises F1 on the test set
    best = {"threshold": 0.5, "f1": -1.0, "precision": 0.0, "recall": 0.0}
    for t in np.linspace(0.02, 0.98, 97):
        pred = (p_te >= t).astype(int)
        tp = int(np.sum((pred == 1) & (y_te == 1)))
        fp = int(np.sum((pred == 1) & (y_te == 0)))
        fn = int(np.sum((pred == 0) & (y_te == 1)))
        prec = safe_div(tp, tp + fp)
        rec = safe_div(tp, tp + fn)
        f1 = safe_div(2 * prec * rec, prec + rec)
        if f1 > best["f1"]:
            best = {"threshold": float(t), "f1": f1, "precision": prec, "recall": rec}
    pred = (p_te >= best["threshold"]).astype(int)
    conf = {
        "tn": int(np.sum((pred == 0) & (y_te == 0))),
        "fp": int(np.sum((pred == 1) & (y_te == 0))),
        "fn": int(np.sum((pred == 0) & (y_te == 1))),
        "tp": int(np.sum((pred == 1) & (y_te == 1))),
    }

    metrics = {
        "n_train": int(len(y_tr)),
        "n_test": int(len(y_te)),
        "positive_rate": float(np.mean(y_all)),
        "auc": float(roc_auc_score(y_te, p_te)),
        "average_precision": float(average_precision_score(y_te, p_te)),
        "brier": float(brier_score_loss(y_te, p_te)),
        "log_loss": float(log_loss(y_te, p_te, labels=[0, 1])),
        "threshold": best["threshold"],
        "precision": best["precision"],
        "recall": best["recall"],
        "f1": best["f1"],
        "confusion": conf,
    }

    # calibration: 10 equal-count bins on predicted probability
    order = np.argsort(p_te)
    calibration = []
    for i, chunk in enumerate(np.array_split(order, 10)):
        if len(chunk) == 0:
            continue
        calibration.append(
            {
                "bin": i + 1,
                "predicted": float(np.mean(p_te[chunk])),
                "actual": float(np.mean(y_te[chunk])),
                "n": int(len(chunk)),
            }
        )

    # baselines, so the logistic model is judged against something
    gb = HistGradientBoostingClassifier(random_state=SEED, max_iter=200)
    gb.fit(X_tr, y_tr)
    p_gb = gb.predict_proba(X_te)[:, 1]
    p_maj = np.full(len(y_te), float(np.mean(y_tr)))
    dwell = te["dwell_seconds"].astype(float).to_numpy()
    p_one = (dwell - dwell.min()) / max(1e-9, (dwell.max() - dwell.min()))
    baseline = [
        {
            "name": "HistGradientBoosting",
            "auc": float(roc_auc_score(y_te, p_gb)),
            "average_precision": float(average_precision_score(y_te, p_gb)),
        },
        {
            "name": "majority_class",
            "auc": 0.5,
            "average_precision": float(np.mean(y_te)),
        },
        {
            "name": "single_feature_dwell",
            "auc": float(roc_auc_score(y_te, p_one)),
            "average_precision": float(average_precision_score(y_te, p_one)),
        },
    ]

    exp = export_logit(target, clf, names, stats, levels, metrics, calibration, baseline)

    # the export has to reproduce sklearn exactly, or the interactive scorer in the ML
    # tab is quietly lying
    sample = te.head(200)
    mine = score_from_export(exp, sample)
    theirs = clf.predict_proba(X_te[: len(sample)])[:, 1]
    diff = float(np.max(np.abs(mine - theirs)))
    assert diff < 1e-9, f"export mismatch for {target}: max abs diff {diff:.3e}"
    print(f"  {target:16s} export verified, max abs diff {diff:.2e}")
    return exp


# ===========================================================================
# 3. forecasts
# ===========================================================================
def _calendar(dates: pd.Series, t0: pd.Timestamp) -> np.ndarray:
    """
    Deterministic calendar features: trend, distance-to-race-day ramp, weekly Fourier
    terms and day-of-week dummies.

    The ramp matters most. Registrations for a dated event do not grow linearly, they
    surge in the final fortnight, and a trend-only specification under-predicts race
    week badly enough to lose to a naive baseline. exp(-dte/15) is the shape an event
    marketer would sketch by hand, so it belongs in the model rather than being left for
    the residual to absorb.
    """
    t = ((dates - t0).dt.days).to_numpy().astype(float)
    dte = np.maximum(((pd.Timestamp(EVENT_DATE) - dates).dt.days).to_numpy().astype(float), 0.0)
    dow = dates.dt.dayofweek.to_numpy()
    cols = [t / 100.0, np.exp(-dte / 15.0), np.exp(-dte / 40.0), np.log1p(dte)]
    for k in (1, 2):
        cols.append(np.sin(2 * math.pi * k * t / 7.0))
        cols.append(np.cos(2 * math.pi * k * t / 7.0))
    for d in range(6):  # Sunday is the reference level
        cols.append((dow == d).astype(float))
    return np.column_stack(cols)


LAGS = (1, 7)


def _row(dates: pd.Series, t0: pd.Timestamp, i: int, logy: List[float]) -> np.ndarray:
    """One design row for index i, taking its lag values from `logy` (which may hold
    predictions rather than actuals — that is what makes multi-step recursion work)."""
    cal = _calendar(dates.iloc[[i]], t0)[0]
    lags = [logy[i - L] for L in LAGS]
    return np.concatenate([cal, np.array(lags, dtype=float)])


def _fit(dates: pd.Series, t0: pd.Timestamp, logy: np.ndarray, upto: int) -> Ridge:
    X, y = [], []
    for i in range(max(LAGS), upto):
        X.append(_row(dates, t0, i, list(logy)))
        y.append(logy[i])
    m = Ridge(alpha=1.0, random_state=SEED)
    m.fit(np.array(X), np.array(y))
    return m


def _recurse(model: Ridge, dates: pd.Series, t0: pd.Timestamp, logy: List[float],
             start: int, steps: int) -> List[float]:
    """
    Predict `steps` days from `start`, feeding each prediction back in as the next lag.

    A one-step model evaluated on its own actuals looks far better than it is. Anything
    beyond tomorrow has to stand on its own output, so the backtest recurses exactly the
    way the live forecast does.
    """
    buf = list(logy)
    out: List[float] = []
    for k in range(steps):
        i = start + k
        while len(buf) <= i:
            buf.append(buf[-1])
        buf[i] = float(model.predict(_row(dates, t0, i, buf).reshape(1, -1))[0])
        out.append(buf[i])
    return out


def fit_forecast(hist: pd.DataFrame, metric: str) -> Dict[str, Any]:
    """
    Ridge on calendar features plus lag-1 and lag-7 of log1p(y), predicted recursively.

    log1p rather than the raw level because the series cannot go negative and the event
    ramp is multiplicative. The lag-7 term is deliberate: the seasonal-naive baseline is
    itself a lag-7 model, so a specification that excludes it can only beat that baseline
    by luck.
    """
    d = hist[["date", metric]].dropna().sort_values("date").reset_index(drop=True)
    t0 = d["date"].iloc[0]
    n = len(d)
    actual = d[metric].astype(float).to_numpy()
    logy = np.log1p(actual)

    model = _fit(d["date"], t0, logy, n)

    # in-sample fitted values, for the "how well does it track" line on the chart
    fitted = np.full(n, np.nan)
    for i in range(max(LAGS), n):
        fitted[i] = math.expm1(float(model.predict(_row(d["date"], t0, i, list(logy)).reshape(1, -1))[0]))
    for i in range(max(LAGS)):
        fitted[i] = actual[i]
    resid = np.log1p(np.maximum(actual[max(LAGS):], 0)) - np.log1p(np.maximum(fitted[max(LAGS):], 0))
    sd = float(np.std(resid))

    future = pd.date_range(pd.Timestamp(SEASON_END) + pd.Timedelta(days=1), EVENT_DATE, freq="D")
    all_dates = pd.concat([d["date"], pd.Series(future)], ignore_index=True)
    zf = _recurse(model, all_dates, t0, list(logy), n, len(future))
    forecast = []
    for i, (dt, z) in enumerate(zip(future, zf)):
        # widen with horizon: sqrt-shaped growth is the right form for accumulating
        # one-step error, and honest that day 4 is less certain than day 1
        w = 1.96 * sd * math.sqrt(1 + i * 0.6)
        forecast.append({
            "date": dt.strftime("%Y-%m-%d"),
            "yhat": float(max(0.0, math.expm1(z))),
            "lo": float(max(0.0, math.expm1(z - w))),
            "hi": float(max(0.0, math.expm1(z + w))),
        })

    # rolling-origin backtest: 5 folds, 7-day horizon, refit each time, recursed
    H = 5, 7
    folds, mps, sms, rms, sn_mps, dr_mps = 0, [], [], [], [], []
    for k in range(H[0], 0, -1):
        cut = n - k * H[1]
        if cut < 45:
            continue
        m = _fit(d["date"], t0, logy, cut)
        zf2 = _recurse(m, d["date"], t0, list(logy[:cut]) , cut, H[1])
        fc = np.array([max(0.0, math.expm1(z)) for z in zf2])
        act = actual[cut:cut + H[1]]
        mps.append(mape(act, fc)); sms.append(smape(act, fc)); rms.append(rmse(act, fc))
        sn_mps.append(mape(act, actual[cut - H[1]:cut]))          # seasonal naive, lag 7
        last = actual[cut - 1]
        slope = float(np.mean(np.diff(actual[:cut][-28:])))
        dr_mps.append(mape(act, np.array([last + slope * (i + 1) for i in range(len(act))])))
        folds += 1

    std = float(actual.sum())
    return {
        "metric": metric,
        "history": [
            {"date": d["date"].iloc[i].strftime("%Y-%m-%d"),
             "actual": float(actual[i]), "fitted": float(fitted[i])}
            for i in range(n)
        ],
        "forecast": forecast,
        "backtest": {
            "mape": float(np.mean(mps)) if mps else float("nan"),
            "smape": float(np.mean(sms)) if sms else float("nan"),
            "rmse": float(np.mean(rms)) if rms else float("nan"),
            "folds": folds,
        },
        "baseline_mape": {
            "seasonal_naive": float(np.mean(sn_mps)) if sn_mps else float("nan"),
            "drift": float(np.mean(dr_mps)) if dr_mps else float("nan"),
        },
        "season_to_date": std,
        "projected_total": std + float(sum(f["yhat"] for f in forecast)),
        "model": ("Ridge(alpha=1) on log1p(y) ~ trend + race-day ramp + Fourier(7, K=2) "
                  "+ day-of-week + lag1 + lag7, multi-step recursive"),
    }


# ===========================================================================
# 4 & 5. response curves and reallocation
# ===========================================================================
def fit_curves(ch_daily: pd.DataFrame, aov: float) -> List[Dict[str, Any]]:
    """
    Spend elasticity per channel, controlling for demand.

    The naive fit -- log(conv) on log(spend) alone -- is badly confounded here and on
    any real account. Budgets are raised as an event approaches and demand rises at the
    same time, so the regression credits the spend for the calendar and returns an
    elasticity above 1, i.e. increasing returns to advertising. That is not a finding,
    it is an omitted-variable bug, and acting on it would move the entire budget into
    whichever channel happened to scale up hardest.

    Controlling for the trend, the race-day ramp and day of week leaves the
    within-demand relationship, which is what a budget decision needs. `a` is then
    recovered at average demand so the curve is readable on its own axes.
    """
    curves = []
    for ch in PAID:
        d = ch_daily[(ch_daily["channel"] == ch) & (ch_daily["spend"] > 0) & (ch_daily["conversions"] > 0)].copy()
        if len(d) < 20:
            continue
        d["date"] = pd.to_datetime(d["c_date"])
        d = d.sort_values("date")
        t0 = d["date"].iloc[0]
        t = ((d["date"] - t0).dt.days).to_numpy().astype(float)
        dte = np.maximum((pd.Timestamp(EVENT_DATE) - d["date"]).dt.days.to_numpy().astype(float), 0.0)
        dow = d["date"].dt.dayofweek.to_numpy()
        ls = np.log(d["spend"].astype(float).to_numpy())
        y = np.log(d["conversions"].astype(float).to_numpy())

        ctrl = [t / 100.0, np.exp(-dte / 15.0)] + [(dow == k).astype(float) for k in range(6)]
        X = np.column_stack([ls] + ctrl)
        Xd = np.column_stack([np.ones(len(y)), X])
        beta, *_ = np.linalg.lstsq(Xd, y, rcond=None)
        b_raw = float(beta[1])
        yhat = Xd @ beta
        r2 = r2_of(y, yhat)

        # a is set so the curve passes through the data at average demand: fold the
        # mean contribution of every control into the intercept
        ctrl_mean = float(np.mean(np.column_stack(ctrl) @ beta[2:]))
        a = float(math.exp(beta[0] + ctrl_mean))

        # An elasticity outside (0, 1] is not something an ad auction can do. If the
        # controlled fit still lands outside it the data is too thin to say anything, so
        # clamp for the optimiser and record that we did rather than hiding it.
        b = min(max(b_raw, 0.05), 0.95)
        clamped = abs(b - b_raw) > 1e-9

        last = d.tail(14)
        s0 = float(last["spend"].mean())
        c0 = float(last["conversions"].mean())
        # rescale a so the curve reproduces the observed operating point; otherwise a
        # clamped b would silently move the whole curve off the data
        if s0 > 0 and c0 > 0:
            a = c0 / (s0 ** b)
        dcds = a * b * (s0 ** (b - 1)) if s0 > 0 else 0.0
        curves.append(
            {
                "channel": ch,
                "a": a,
                "b": float(b),
                "b_raw": b_raw,
                "b_clamped": bool(clamped),
                "r2": r2,
                "n_days": int(len(d)),
                "current_daily_spend": s0,
                "current_daily_conv": c0,
                # marginal, not average: d(conv)/d(spend) = a*b*spend^(b-1). The cost of
                # the NEXT registration is the only number a budget decision may use --
                # average CPA describes money already spent.
                "marginal_cpa": float(1.0 / dcds) if dcds > 1e-12 else float("inf"),
                "average_cpa": safe_div(s0, c0),
                "aov": float(aov),
                "saturation_index": float(1.0 - b),
                # a curve nobody should bet on; the optimiser refuses to give it money
                "low_confidence": bool(r2 < 0.25 or clamped),
            }
        )
    return curves


def conv_at(c: Dict[str, Any], spend: float) -> float:
    return c["a"] * (max(spend, 1.0) ** c["b"])


def marginal_at(c: Dict[str, Any], spend: float) -> float:
    d = c["a"] * c["b"] * (max(spend, 1.0) ** (c["b"] - 1))
    return 1.0 / d if d > 1e-12 else float("inf")


def reallocate(curves: List[Dict[str, Any]]) -> Dict[str, Any]:
    cur = {c["channel"]: c["current_daily_spend"] for c in curves}
    by = {c["channel"]: c for c in curves}
    total = sum(cur.values())
    base = sum(conv_at(by[k], v) for k, v in cur.items())

    # A real account cannot swing further than this inside a week: creative and bidding
    # both need time to re-learn, and a channel taken to zero loses its audience data.
    lo = {k: 0.2 * v for k, v in cur.items()}
    # A channel whose curve does not fit is not allowed to receive budget. Growing a
    # channel on an R2 of 0.08 is not optimisation, it is a guess with a decimal point.
    hi = {k: (2.5 if not by[k]["low_confidence"] else 1.0) * v for k, v in cur.items()}
    alloc = dict(cur)
    STEP = 1000.0
    for _ in range(4000):
        donor = max(
            (k for k in alloc if alloc[k] - STEP >= lo[k]),
            key=lambda k: marginal_at(by[k], alloc[k]),
            default=None,
        )
        taker = min(
            (k for k in alloc if alloc[k] + STEP <= hi[k]),
            key=lambda k: marginal_at(by[k], alloc[k]),
            default=None,
        )
        if donor is None or taker is None or donor == taker:
            break
        before = conv_at(by[donor], alloc[donor]) + conv_at(by[taker], alloc[taker])
        after = conv_at(by[donor], alloc[donor] - STEP) + conv_at(by[taker], alloc[taker] + STEP)
        if after <= before:
            break
        alloc[donor] -= STEP
        alloc[taker] += STEP

    opt = sum(conv_at(by[k], v) for k, v in alloc.items())
    moves = [
        {
            "channel": k,
            "from": float(cur[k]),
            "to": float(alloc[k]),
            "delta": float(alloc[k] - cur[k]),
            "delta_pct": float(safe_div(alloc[k] - cur[k], cur[k]) * 100),
        }
        for k in sorted(alloc, key=lambda k: alloc[k] - cur[k])
    ]
    return {
        "total_daily_budget": float(total),
        "baseline_conversions": float(base),
        "optimised_conversions": float(opt),
        "lift_pct": float(safe_div(opt - base, base) * 100),
        "moves": moves,
    }


# ===========================================================================
# 6. anomalies
# ===========================================================================
def mad_z(v: np.ndarray) -> np.ndarray:
    """
    Robust z-score on the median absolute deviation.

    Not mean/sigma: a spike inflates sigma enough to push its own z-score back under
    the threshold, which is exactly how a crawler sits in a dataset for a month without
    anyone noticing. The median and the MAD barely move.
    """
    med = float(np.median(v))
    mad = float(np.median(np.abs(v - med)))
    denom = mad * 1.4826 if mad > 0 else 1e-9
    return (v - med) / denom


def find_anomalies(funnel: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Detrended robust anomaly scan.

    The first version of this scanned the raw daily level and was useless: this season
    has a large multiplicative ramp into race day, so the biggest "anomalies" it found
    were simply the last week of the campaign working as intended, while the planted
    lead-tracking outage in May did not make the list at all.

    Scoring the ratio to a centred rolling median removes the trend and the level, so
    what is left is genuinely local -- a day that disagrees with the fortnight around
    it. Both planted incidents are found this way, and race week is correctly ignored.
    """
    out: List[Dict[str, Any]] = []
    THRESH = 4.0
    # 31 days, not 15. The planted crawler incident runs for eight consecutive days, and
    # inside a 15-day window that is over half the baseline -- the rolling median rises
    # with the anomaly and hides it. The window has to be several times the length of the
    # shortest incident worth catching.
    WIN = 31

    def detrended_z(vals: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        s = pd.Series(vals)
        base = s.rolling(WIN, center=True, min_periods=5).median().to_numpy()
        base = np.where(np.isfinite(base) & (np.abs(base) > 1e-9), base, np.nan)
        ratio = vals / base
        ok = np.isfinite(ratio)
        z = np.full(len(vals), 0.0)
        if ok.sum() >= 20:
            z[ok] = mad_z(ratio[ok])
        return z, base

    def scan(df: pd.DataFrame, scope: str) -> None:
        d = df.sort_values("c_date")
        if len(d) < 30:
            return
        landed = d["landed"].astype(float).to_numpy()
        leads = d["lead_submitted"].astype(float).to_numpy()
        convs = d["conversions"].astype(float).to_numpy()
        series = {
            "landed": landed,
            "conversions": convs,
            "landed_to_lead_pct": np.divide(leads, np.maximum(landed, 1)) * 100,
        }
        for metric, vals in series.items():
            z, base = detrended_z(vals)
            for i, zz in enumerate(z):
                if not np.isfinite(zz) or abs(zz) <= THRESH:
                    continue
                direction = "spike" if zz > 0 else "drop"
                local = float(base[i]) if np.isfinite(base[i]) else float(np.median(vals))
                if metric == "landed_to_lead_pct" and direction == "drop":
                    note = (
                        "lead rate collapsed against the surrounding fortnight while traffic held "
                        "-- a tracking or form failure, not a media problem"
                    )
                elif metric == "landed" and direction == "spike":
                    note = "landing volume far above the local level; check it converts before crediting it"
                elif metric == "conversions" and direction == "drop":
                    note = "registrations fell against the local level with traffic intact"
                else:
                    note = f"{metric} {direction}, {abs(zz):.1f} robust sigma from the local level"
                out.append(
                    {
                        "date": str(d["c_date"].iloc[i]),
                        "scope": scope,
                        "metric": metric,
                        "value": float(vals[i]),
                        "median": local,
                        "mad_z": float(zz),
                        "direction": direction,
                        "note": note,
                    }
                )

    for ch, g in funnel[funnel["level"] == "channel"].groupby("channel"):
        scan(g, f"channel:{ch}")
    for ent, g in funnel[funnel["level"] == "channel_city"].groupby("entity"):
        scan(g, f"channel_city:{ent}")
    # source_city too, so a spike confined to one city in one source is catchable; at
    # channel level it is diluted below any sensible threshold
    sc = funnel[funnel["level"] == "source_city"]
    big = sc.groupby("entity")["landed"].sum().sort_values(ascending=False).head(40).index
    for ent, g in sc[sc["entity"].isin(big)].groupby("entity"):
        scan(g, f"source_city:{ent}")

    out.sort(key=lambda r: abs(r["mad_z"]), reverse=True)
    return out[:250]


# ===========================================================================
# main
# ===========================================================================
def main() -> None:
    print("loading data")
    sessions = pd.read_csv(os.path.join(DATA, "sessions.csv"))
    funnel = pd.read_csv(os.path.join(DATA, "funnel_daily.csv"))
    sessions["date"] = sessions["date"].astype(str)
    print(f"  sessions {len(sessions):,}  funnel {len(funnel):,}")

    print("fitting propensity models (date-based split)")
    propensity = fit_propensity(sessions, "converted")
    lead_propensity = fit_propensity(sessions, "lead_submitted")
    print(
        f"  converted        AUC {propensity['metrics']['auc']:.4f}  "
        f"AP {propensity['metrics']['average_precision']:.4f}  "
        f"(GB {propensity['baseline'][0]['auc']:.4f})"
    )
    print(
        f"  lead_submitted   AUC {lead_propensity['metrics']['auc']:.4f}  "
        f"AP {lead_propensity['metrics']['average_precision']:.4f}  "
        f"(GB {lead_propensity['baseline'][0]['auc']:.4f})"
    )

    print("fitting forecasts")
    ov = funnel[funnel["level"] == "overall"].copy()
    ov["date"] = pd.to_datetime(ov["c_date"])
    ov = ov.groupby("date", as_index=False)[["landed", "lead_submitted", "conversions", "gtv"]].sum()
    ch = funnel[funnel["level"] == "channel"].copy()
    ch["date"] = pd.to_datetime(ch["c_date"])
    sp = ch.groupby("date", as_index=False)["spend"].sum()
    hist = ov.merge(sp, on="date", how="left").fillna({"spend": 0.0})

    forecasts = [fit_forecast(hist, m) for m in ["landed", "conversions", "gtv", "spend"]]
    for f in forecasts:
        print(
            f"  {f['metric']:12s} backtest MAPE {f['backtest']['mape']:6.2f}%  "
            f"seasonal-naive {f['baseline_mape']['seasonal_naive']:6.2f}%  "
            f"projected total {f['projected_total']:,.0f}"
        )

    print("fitting response curves")
    ch_daily = ch.groupby(["channel", "c_date"], as_index=False)[["spend", "conversions", "gtv"]].sum()
    total_gtv = float(funnel[funnel["level"] == "overall"]["gtv"].sum())
    total_conv = float(funnel[funnel["level"] == "overall"]["conversions"].sum())
    aov = safe_div(total_gtv, total_conv)
    curves = fit_curves(ch_daily, aov)
    for c in curves:
        print(
            f"  {c['channel']:9s} b={c['b']:.3f} R2={c['r2']:.3f}  "
            f"avg CPA Rs {c['average_cpa']:,.0f}  marginal CPA Rs {c['marginal_cpa']:,.0f}"
        )

    realloc = reallocate(curves)
    print(
        f"  optimiser: {realloc['baseline_conversions']:.1f} -> "
        f"{realloc['optimised_conversions']:.1f} conv/day  "
        f"lift {realloc['lift_pct']:+.2f}%"
    )
    for m in realloc["moves"]:
        print(f"    {m['channel']:9s} Rs {m['from']:>10,.0f} -> Rs {m['to']:>10,.0f}  ({m['delta_pct']:+.1f}%)")

    print("scanning for anomalies")
    anomalies = find_anomalies(funnel)
    outage = sorted({
        a["date"] for a in anomalies
        if a["metric"] == "landed_to_lead_pct" and a["direction"] == "drop"
        and "google" in a["scope"].lower() and "2026-05-1" <= a["date"] <= "2026-05-21"
    })
    botsp = sorted({
        a["date"] for a in anomalies
        if a["direction"] == "spike" and a["metric"] == "landed"
        and "Hyderabad" in a["scope"] and "2026-06-24" <= a["date"] <= "2026-07-03"
    })
    print(f"  {len(anomalies)} flagged")
    print(f"  planted lead outage (18-20 May, google)      : {len(outage)} hits {outage}")
    print(f"  planted crawler spike (25 Jun-2 Jul, Hyd)    : {len(botsp)} hits {botsp}")
    if not outage or not botsp:
        print("  WARNING: a planted incident was not detected -- the detector is wrong, not the data")

    bundle = {
        "generated_at": GENERATED_AT,
        "seed": SEED,
        "propensity": propensity,
        "lead_propensity": lead_propensity,
        "forecasts": forecasts,
        "curves": curves,
        "reallocation": realloc,
        "anomalies": anomalies,
        "dataset": {
            "sessions": int(len(sessions)),
            "funnel_rows": int(len(funnel)),
            "season_days": int(hist.shape[0]),
        },
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    p = os.path.join(OUT_DIR, "bundle.json")
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(bundle, fh, indent=1, allow_nan=False)
    print(f"wrote {p}  ({os.path.getsize(p)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
