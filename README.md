# RunPulse Analytics

Marketing analytics and forecasting dashboard for a mass-participation running event.
Thirteen views over a 172-day campaign season, six trained models, and a data-quality
layer that verifies its own numbers before showing them.

**Live:** https://runpulse-bhargavi-aitwade-mit-wpu-capstone.vercel.app

![Stack](https://img.shields.io/badge/Next.js-14-black) ![TS](https://img.shields.io/badge/TypeScript-strict-3178c6) ![Py](https://img.shields.io/badge/scikit--learn-1.7-f7931e)

---

## What it does

An event marketing team spends across Meta, Google, LinkedIn and print, and needs to
answer four questions every week:

1. Where is the money going, and what is coming back?
2. Which channel should get the next rupee?
3. Are the numbers even correct?
4. How does the season finish?

Each of those maps to a part of the app: the channel views, the response curves and
optimiser, the data-quality checks, and the forecast.

---

## Quick start

```bash
npm install
npm run gen:data      # build the dataset          ~15s
npm run train         # fit the models (Python)    ~60s
npm run dev           # http://localhost:3100
```

`npm run train` needs Python 3.10+ with `numpy`, `pandas`, `scikit-learn`
(`pip install -r ml/requirements.txt`). The app runs without it; only the Forecast and
ML Lab views need the model output.

For the AI Analyst view, put a Gemini key in `.env.local`:

```
GEMINI_API_KEY=your_key_here
```

---

## Views

| View | Contents |
|---|---|
| **Overall** | Blended funnel, channel mix, daily trend. Reports blended and paid-only ROAS separately. |
| **Meta Ads** | Campaign → ad set → creative → creative type. Creative fatigue plotted by days on air. |
| **Google Ads** | Campaign type breakdown, and channel ROAS with and without brand search. |
| **LinkedIn Ads** | Audience and campaign performance across the two buying flights. |
| **Print Ads** | Publication, slot and negotiated rate, measured on cost per thousand reach. |
| **Marketing Mix** | All eight channels side by side, ranked by revenue share against spend share. |
| **City wise** | Six cities, every funnel step, with per-city anomaly detection. |
| **Ticket Mix** | Eight ticket types, volume against revenue, and how the mix moves toward race day. |
| **Analysis** | Movers, funnel diagnostics, anomaly scan, efficiency quadrant. |
| **Forecast** | Projection to race day with prediction intervals and backtest results. |
| **ML Lab** | Model metrics, calibration, an interactive scorer, response curves, budget optimiser. |
| **Data Quality** | Reconciliation checks and known tracking faults. |
| **AI Analyst** | Natural-language questions answered from the season aggregates. |

---

## Architecture

```
data/*.csv  ──►  lib/csv.ts      typed loaders, parsed once per process
                     │
                     ▼
                lib/data.ts      derivation: ratios, slicing, movers, anomalies
                     │
                     ▼
                app/api/*   ──►  13 client views
                     ▲
                     │
ml/train.py  ──►  ml/models/bundle.json  ──►  lib/ml.ts   (scored in TypeScript)
```

**Models train in Python, score in TypeScript.** `ml/train.py` exports coefficients,
scaler parameters and reference levels to JSON. The web app reads that JSON and computes
predictions itself, so no Python runs in production and the interactive scorer responds
instantly. The training script verifies the TypeScript scoring path against
`sklearn.predict_proba` to 1e-9 before writing the file.

**Derivation is centralised.** No view does its own arithmetic. Ratios are always computed
from summed numerators and denominators, never averaged from per-day ratios, because the
mean of daily conversion rates is not the conversion rate.

**Wire format is columnar.** The funnel table is 76k rows that repeat 172 dates, 22 levels
and 667 entity names. As an array of objects that is 17.3 MB, which exceeds the 4.5 MB
serverless response cap. Interning the strings into dictionaries and sending positional
tuples brings it to 2.6 MB with no loss of information. The same packer handles the four
channel tables. See `lib/pack.ts`.

| Endpoint | Before | After |
|---|---|---|
| `/api/data` | 17.33 MB | 2.61 MB |
| `/api/meta` | 8.48 MB | 1.14 MB |
| `/api/google` | 2.17 MB | 0.37 MB |
| `/api/linkedin` | 0.86 MB | 0.12 MB |

---

## Data

The dataset is simulated. `scripts/generate.mjs` runs a seeded simulation of an ad auction,
a registration funnel and a ticket ladder, then aggregates the result into 22 reporting
levels and draws an 80,000-row session sample for model training. Both come out of one
pass, so the dashboard totals and the training set cannot disagree.

| File | Rows | Grain |
|---|---|---|
| `funnel_daily.csv` | 76,453 | day × level × entity |
| `meta_ads_daily.csv` | 23,892 | campaign × ad set × creative × city |
| `google_ads_daily.csv` | 9,504 | campaign × city |
| `linkedin_ads_daily.csv` | 3,480 | campaign × audience × city |
| `print_ads_daily.csv` | 128 | publication × slot × city |
| `sessions.csv` | 79,996 | one row per session |

Season 2026-03-01 to 2026-08-19, race day 2026-08-23. Six cities, eight channels, 32 paid
campaigns, eight publications, eight ticket types. Seed `20260823`, so a rebuild reproduces
the dataset exactly.

What the simulation produces:

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

landed 27,91,339  →  leads 3,24,087  →  pay 1,26,651  →  registrations 72,325
GTV Rs 13.40 Cr on Rs 2.73 Cr paid spend       AOV Rs 1,853
funnel 11.6%  →  39.1%  →  57.1%               landed to registration 2.59%
blended ROAS 4.91x                             paid-only ROAS 3.11x
```

Modelled effects: weekly seasonality, an exponential ramp into race day, four price-rise
deadlines, creative fatigue by asset type, city income skew, a ticket price ladder,
auction saturation, and independent budget pacing drift.

The last two matter more than they sound. **Auction saturation** raises effective CPM as
`(daily spend / reference)^k`, so landings grow like `spend^(1-k)` rather than linearly —
without it the true spend elasticity is exactly 1.0 and a response curve has nothing to
measure. **Pacing drift** is a re-centred random walk per channel, independent of demand;
without it spend is a deterministic function of the demand index, perfectly collinear with
the trend controls, and the elasticity is not statistically identifiable.

---

## Models

`ml/train.py`, scikit-learn. Every number below is measured on held-out data.

### Propensity — logistic regression

Trained on the first 80% of the season, tested on the last 20%. The split is by date, not
random: a random split puts sessions from the same day on both sides, and since day-level
demand drives conversion, that leaks the future into training and inflates AUC.

| Target | AUC | Avg precision | Gradient boosting |
|---|---|---|---|
| `converted` (2.6% base rate) | **0.648** | 0.059 | 0.634 |
| `lead_submitted` | **0.617** | 0.200 | 0.598 |

Also benchmarked against majority-class and single-feature baselines. Exported with
calibration deciles, a gain and lift table, and the twelve largest coefficients as odds
ratios.

### Forecast — Ridge on `log1p(y)`

Features: linear trend, race-day proximity ramp, Fourier terms at period 7, day-of-week
dummies, and lag-1 and lag-7 of the series. Multi-step predictions are recursive, so the
model stands on its own output rather than on actuals it will not have. Backtested with
rolling origins, five folds, seven-day horizon, refit at each origin.

| Metric | Model MAPE | Seasonal naive |
|---|---|---|
| Registrations | **16.1%** | 20.0% |
| GTV | **16.9%** | 20.8% |
| Spend | **15.4%** | 19.0% |
| Landed | 10.4% | 10.2% |

The lag-7 term is deliberate. A seasonal-naive baseline *is* a lag-7 model, so a
specification that omits it can only beat that baseline by luck. Registrations, GTV and
spend beat it. Landed is a tie, and is reported as one.

### Response curves — `registrations = a · spend^b`

Fitted per channel while holding trend, race-day proximity and day of week constant.

| Channel | Elasticity | R² | Average CPA | Marginal CPA |
|---|---|---|---|---|
| Meta | 0.933 | 0.889 | Rs 471 | Rs 505 |
| Google | 0.820 | 0.797 | Rs 316 | Rs 385 |
| LinkedIn | 0.950 | 0.388 | Rs 4,607 | Rs 4,850 |
| Print | 0.950 | 0.645 | Rs 6,802 | Rs 7,160 |

The demand controls are load-bearing. Fitting `log(conv)` on `log(spend)` alone returns an
elasticity of **1.88** for Google — increasing returns to advertising, which no ad auction
can produce. It is an omitted-variable artefact: budgets rise as the event approaches and
so does organic demand, so the regression credits the spend for the calendar.

Marginal CPA, not average, is the number a budget decision uses. Average CPA describes
money already spent.

### Budget optimiser

Hill-climbs the four curves at fixed total daily budget, moving Rs 1,000 at a time toward
the lowest marginal CPA. Each channel is floored at 20% and capped at 250% of current
spend, since bidding and creative both need time to re-learn and a channel taken to zero
loses its audience data. A curve with R² below 0.25 cannot receive budget at all.

Result: **+38.1% registrations per day** at the same total spend. Print −79%, Meta −79%,
LinkedIn −80%, Google +89%.

### Anomaly detection

Robust z-score on the median absolute deviation, computed on the ratio to a 31-day centred
rolling median.

MAD rather than standard deviation because a large spike inflates σ enough to push its own
z-score back under the threshold. Detrended because this season has a strong ramp into race
day, and a raw score on a trending series flags the trend instead of the anomaly. The
31-day window is sized against the shortest fault worth catching: inside a 15-day window an
eight-day incident is more than half the baseline and lifts the median along with itself.

---

## Data quality

`/api/quality` runs six checks on every request. Each reports what it expected alongside
what it measured.

| Check | Result |
|---|---|
| Channel rows sum to the overall level, daily, on four metrics | pass — 0 mismatches |
| All seven city levels roll up to their parent, and every parent key resolves | pass — 0 orphans |
| Channel reporting reconciles to the funnel table | pass — worst gap 0.00016% |
| No date gaps, nothing outside the season | pass — 172 consecutive days |
| No negatives; registrations ≤ pay ≤ leads ≤ landed daily | pass |
| Two known tracking faults still detected | warn — 2 of 2 found |

The unresolved-parent check matters more than it looks. A `parent` key that does not match
an entity at the level above silently empties a drill-down: child rows stop appearing and
nothing raises an error.

The two faults are deliberate, so the monitoring has something verifiable to catch:

| Fault | Window | Evidence |
|---|---|---|
| Lead events stopped firing on Google traffic | 18–20 May | landed-to-lead fell to 3.8% against a 12.4% median, landings unaffected |
| Crawler inflated organic landings in Hyderabad | 25 Jun – 2 Jul | median landings 365 → 912 (2.50×) while landed-to-registration fell 2.75% → 0.34% |

---

## Stack

Next.js 14 App Router · TypeScript (strict) · React 18 · Recharts · Papaparse ·
Google Generative AI · Python 3.10 with numpy, pandas, scikit-learn

Three themes from a single stylesheet using CSS custom properties. No authentication.
47 TypeScript files, all typechecking clean.

---

## Caveats

- The response curves are fitted on observational spend with demand controls, not on a
  randomised experiment. They show association. The optimiser's +38% is what the fitted
  relationship implies, not a guaranteed outcome.
- Attribution is last-touch throughout. Print's near-zero tracked ROAS is a consequence of
  that choice, not a measurement of print's effect.
- A propensity AUC of 0.648 on a 2.6% base rate is a real signal and useful for ranking
  sessions, but it is not a strong classifier and should not drive a decision about any
  individual session.

---

## Layout

```
app/            routes and API handlers
components/     shared UI, and one file per view under tabs/
lib/            loaders, derivation, formatting, packing, model scoring, quality checks
ml/             training script and exported model bundle
scripts/        data simulation
data/           generated CSVs
```
