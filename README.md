# RunPulse Analytics

A marketing analytics, data-quality and forecasting platform for a fictional running
event — the **Velocity Run Series 2026**. Thirteen tabs over a 172-day campaign, six
trained models, and a data-quality layer that has to prove it can catch a known fault
before it is allowed to show a green tick.

Everything in it is synthetic and reproducible from one seed. There is no
authentication, nothing is deployed, and no real campaign data is involved.

```
npm run gen:data     # build the dataset      (~15s)
npm run train        # fit the six models     (~60s, needs Python)
npm run dev          # http://localhost:3100
```

---

## Why it exists

Most portfolio dashboards read a CSV and draw charts. The interesting problems in
marketing analytics are the ones underneath that: whether the numbers reconcile, whether
a channel's apparent efficiency survives a look at its *marginal* cost, whether a
"record traffic day" was human, and whether a forecast is better than doing nothing.
This project is built around those four questions.

---

## Architecture

```
scripts/generate.mjs  ──►  data/*.csv  ──►  lib/csv.ts     (typed loaders, parse-once cache)
   simulate, then                              │
   aggregate                                   ▼
                                          lib/data.ts      (derivation: ratios, slicing, movers)
                                               │
ml/train.py  ──►  ml/models/bundle.json  ──►  lib/ml.ts    (scores the exported coefficients)
   scikit-learn                                │
                                               ▼
                                        app/api/* ──► 13 tab components
```

Two decisions shape everything else.

**The data is simulated, then aggregated — not the other way round.** The generator
simulates an ad auction, a funnel and a ticket ladder, then rolls the result up into 22
reporting levels *and* draws an 80,000-row session sample. The dashboard's aggregates and
the ML training set therefore come out of one pass of one process and cannot disagree.

**Models are trained in Python and scored in TypeScript.** `ml/train.py` exports
coefficients, scaler parameters and reference levels to a single JSON file. The running
app needs no Python. The training script asserts that the TypeScript scoring path
reproduces `sklearn.predict_proba` to within 1e-9 on held-out rows — which is the only
reason the interactive scorer in the ML Lab tab can be trusted.

---

## The dataset

| File | Rows | Grain |
|---|---|---|
| `funnel_daily.csv` | 76,453 | day × level × entity, long format, 22 levels |
| `meta_ads_daily.csv` | 23,892 | campaign × ad set × creative × city |
| `google_ads_daily.csv` | 9,504 | campaign × city |
| `linkedin_ads_daily.csv` | 3,480 | campaign × audience × city |
| `print_ads_daily.csv` | 128 | publication × slot × city |
| `sessions.csv` | 79,996 | one row per session, the ML training set |

Season 2026-03-01 → 2026-08-19 (172 days), race day 2026-08-23. Six cities, eight
channels, 14 Meta / 12 Google / 6 LinkedIn campaigns, 8 publications, 8 ticket types.
Seed `20260823`.

What it lands on, all measured rather than asserted:

```
channel     spend L  mix%     landed    regs   GTV Cr    CPC    CAC   ROAS
Meta          124.0  45.4   9,92,760  18,678     3.43   12.5    664  2.77x
Google        107.2  39.3   8,55,690  26,580     4.94   12.5    403  4.61x
Print          22.2   8.1     32,006     268     0.05   69.3   8270  0.23x
LinkedIn       19.7   7.2     25,250     352     0.07   77.8   5583  0.34x
Organic          -      -   5,03,381  15,361     2.85      -      -      -
Email            -      -   1,65,665   6,621     1.22      -      -      -
Referral         -      -   1,14,991   2,824     0.53      -      -      -
Affiliate        -      -   1,01,596   1,641     0.31      -      -      -

landed 27,91,339 → leads 3,24,087 → pay 1,26,651 → registrations 72,325
GTV ₹13.40 Cr on ₹2.73 Cr paid spend · AOV ₹1,853
funnel 11.6% → 39.1% → 57.1%  (landed → registration 2.59%)
blended ROAS 4.91x · paid-only ROAS 3.11x
```

The simulation earns those numbers rather than being tuned to them. It models weekly
seasonality, an exponential ramp into race day, four price-rise deadlines, creative
fatigue by asset type, city wealth skew, a ticket price ladder, and **auction saturation**
— effective CPM rises as `(daily spend / reference)^sat`, so landings grow like
`spend^(1-sat)` instead of linearly. Without that last piece the true spend elasticity
would be exactly 1.0 and the response curves below would have nothing to find.

It also models **budget pacing drift**: a re-centred random walk per channel, independent
of demand. Without it, spend is a deterministic function of the demand index, perfectly
collinear with the trend controls, and the spend elasticity is not statistically
identified at all.

---

## The models

`ml/train.py`, scikit-learn 1.7.2. Every figure below is held-out.

### 1–2. Conversion and lead propensity — logistic regression

Split **by date**, not at random: train on the first 80% of the season, test on the last
20%. A random split puts sessions from the same day on both sides, and since day-level
demand drives conversion, that leaks the future into training and inflates AUC.

| | AUC | Avg precision | vs HistGradientBoosting |
|---|---|---|---|
| `converted` (2.6% positive) | **0.648** | 0.059 | 0.634 — logistic wins |
| `lead_submitted` | **0.617** | 0.200 | 0.598 — logistic wins |

Also benchmarked against a majority-class baseline and a single-feature baseline.
Exported with calibration deciles, a gain/lift table, and the 12 largest coefficients as
odds ratios.

### 3. Forecast to race day — Ridge on log1p(y)

Trend + race-day ramp `exp(-dte/15)` + Fourier(period 7, K=2) + day-of-week + **lag-1 and
lag-7**, predicted recursively. Rolling-origin backtest, 5 folds, 7-day horizon, refit at
each origin.

| Metric | Model MAPE | Seasonal-naive | |
|---|---|---|---|
| Registrations | **16.1%** | 20.0% | beats baseline |
| GTV | **16.9%** | 20.8% | beats baseline |
| Spend | **15.4%** | 19.0% | beats baseline |
| Landed | 10.4% | 10.2% | a tie — reported as such |

Two things here were fixed rather than hidden. The first specification had no ramp term
and scored 35.8% MAPE against a 17.5% baseline — losing badly to doing nothing. The lag-7
term is deliberate: seasonal-naive *is* a lag-7 model, so a specification that excludes it
can only beat that baseline by luck.

### 4. Budget response curves — `registrations = a · spend^b`

Fitted per channel **controlling for trend, race-day proximity and day of week**. The
naive version of this fit — `log(conv)` on `log(spend)` alone — returned an elasticity of
1.88 for Google, i.e. increasing returns to advertising. That is not a finding, it is an
omitted-variable bug: budgets rise as the event approaches and so does demand, so the
regression credits the spend for the calendar. Acting on it would have moved the entire
budget into one channel for a fictional +336% gain.

| Channel | Elasticity `b` | R² | Average CPA | **Marginal CPA** |
|---|---|---|---|---|
| Meta | 0.933 | 0.889 | ₹471 | ₹505 |
| Google | 0.820 | 0.797 | ₹316 | ₹385 |
| LinkedIn | 0.950 | 0.388 | ₹4,607 | ₹4,850 |
| Print | 0.950 | 0.645 | ₹6,802 | ₹7,160 |

Marginal, not average — the cost of the *next* registration is the only number a budget
decision may use.

### 5. Reallocation optimiser

Hill-climbs the curves at fixed total daily budget, moving ₹1,000 at a time to whichever
channel has the lowest marginal CPA. Each channel is floored at 20% and capped at 250% of
current spend, because bidding and creative both need time to re-learn and a channel taken
to zero loses its audience data. A curve with R² below 0.25 is **not allowed to receive
budget** — growing a channel on an R² of 0.39 is a guess with a decimal point on it.

Result: **+38.1% registrations per day** on the same money — Print −79%, Meta −79%,
LinkedIn −80%, Google +89%.

### 6. Anomaly detection — robust MAD z-score on a detrended series

Median absolute deviation, not mean/σ: a large spike inflates σ enough to push its own
z-score back under the threshold, which is how a crawler sits in a dataset for a month.
Scored on the ratio to a **31-day** centred rolling median. The first version used a
15-day window and missed an 8-day incident entirely — over half the window was inside the
anomaly, so the baseline rose with it.

---

## The two planted incidents

The generator deliberately injects two faults so the data-quality layer has something real
to catch. Both are detected, with measured evidence rather than an assertion:

| Incident | Window | Evidence |
|---|---|---|
| Lead events stopped firing on Google traffic | 18–20 May 2026 | landed→lead fell to **3.8%** against a season median of 12.4%, landings unaffected — a tracking failure, not a media one |
| Crawler inflated organic landings in Hyderabad | 25 Jun – 2 Jul 2026 | median daily landings **365 → 912 (2.50×)** while landed→registration fell **2.75% → 0.34%** |

A detector that cannot demonstrate a catch on a known fault is not evidence of anything.

---

## Data-quality checks

`lib/quality.ts`, run live on every request to `/api/quality`. **5 pass, 1 warn
(the planted incidents, by design), 0 fail.** Each check prints what it expected and what
it measured, so the result can be judged rather than trusted.

1. Channel rows sum to the overall level, day by day, on all four metrics
2. All seven `*_city` levels roll up to their parent **and** every `parent` string
   resolves to a real entity on the same day — a broken parent string silently empties a
   drill-down and raises no error
3. Every channel detail CSV reconciles to its funnel level, worst gap **0.00016%**
4. No date gaps, nothing outside the season
5. No negatives, and `registrations ≤ pay ≤ leads ≤ landed` every day
6. Both planted incidents still detectable

Check 3 earned its place during the build: the platform spend restatement was being
applied to the aggregates but not to the raw exports, showing up as a 0.18% gap on Google
spend. That was fixed at source rather than by widening the tolerance — a tolerance that
exists to accommodate a known cause will hide the next real one too.

---

## The thirteen tabs

| Tab | What it is for |
|---|---|
| **Overall** | Blended funnel, channel mix, daily trend. Shows blended *and* paid-only ROAS side by side, because conflating them is the commonest way an event dashboard flatters itself |
| **Meta Ads** | Campaign → ad set → creative → creative type. Creative fatigue plotted against *days on air*, not date, so assets launched months apart are comparable |
| **Google Ads** | The brand-search problem: Google's headline 4.61x against what the rest of the channel actually returns once brand is stripped out |
| **LinkedIn Ads** | Flights detected from the data rather than hardcoded. ₹77.8 CPC and 0.34x ROAS, reported plainly, with the one point in its favour (corporate-pack AOV) |
| **Print Ads** | Argues that a channel bought for reach cannot be judged on last-click ROAS, and gives cost per thousand reach instead — with the tracked figure framed as a floor |
| **Marketing Mix** | Every channel side by side, sorted by the gap between revenue share and spend share |
| **City wise** | Six cities, every funnel step separately, with a per-city robust z-scan that surfaces the Hyderabad spike |
| **Ticket Mix** | Eight tickets, ₹499 to ₹6,499. Volume versus revenue concentration, and how the mix shifts toward race day |
| **Analysis** | Movers ranked by *absolute* change (a 400% jump on two registrations is noise), funnel diagnostics against the level median, anomaly scan, efficiency quadrant |
| **Forecast** | Projection to race day with prediction bands, backtest folds, and the naive baseline printed next to the model so the reader can judge whether it is worth anything |
| **ML Lab** | Model cards, calibration curve, odds ratios, an interactive scorer, response curves, and the optimiser with its causal caveat attached |
| **Data Quality** | The checks, the reconciliation with tolerances shown, the planted incidents, and dataset provenance |
| **AI Analyst** | Gemini, given aggregates only and instructed to answer from them or say it cannot |

---

## Stack

Next.js 14 (App Router), TypeScript strict, React 18, Recharts, Papaparse,
`@google/generative-ai`. Three themes from one stylesheet via CSS custom properties.
Python 3.10 + numpy/pandas/scikit-learn for training only.

47 project files typecheck clean; production build succeeds; all eight API routes return
200 with the expected shapes.

---

## Honest limitations

- **The data is synthetic.** It is realistic because the generative model is explicit, not
  because it came from a real account. Nothing here validates the *simulation* against
  reality.
- **The response curves are correlational.** They are fitted on observational spend with
  demand controls, not on a randomised experiment. They show association. The optimiser's
  +38% is what the fitted relationship implies, not a guaranteed outcome.
- **Attribution is last-touch throughout.** Print's near-zero tracked ROAS is a
  measurement artefact of that choice, not a finding about print.
- **The propensity AUC is 0.648.** That is a genuine signal on an imbalanced 2.6% target
  and it beats gradient boosting here, but it is not a strong classifier. It is useful for
  ranking sessions, not for deciding about one.
- **The forecast ties with seasonal-naive on `landed`.** Reported as a tie rather than
  quietly dropped.

## Notes

No authentication anywhere, by design. Nothing is deployed and nothing is pushed to a
remote. `GEMINI_API_KEY` lives in `.env.local`; every tab except AI Analyst works without
it. `node_modules` is reached by an NTFS junction because the npm registry was unreachable
in the environment this was built in — a normal `npm install` is all a fresh clone needs.
