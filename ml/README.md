# Models

`python train.py` reads `../data/*.csv` and writes `models/bundle.json`. The dashboard
scores that JSON in TypeScript (`lib/ml.ts`), so the running app needs no Python.

Six models, all metrics held-out:

| # | Model | What it answers | Honest read |
|---|---|---|---|
| 1 | Conversion propensity, logistic regression | will this session register? | AUC 0.648. Real signal on a 2.6% positive rate, beats gradient boosting, but not a strong classifier. Use it to rank, not to decide about one session. |
| 2 | Lead propensity, logistic regression | will this session submit a lead? | AUC 0.617. Same caveat. |
| 3 | Forecast to race day, Ridge on log1p | how does the season finish? | Beats seasonal-naive on registrations, GTV and spend. Ties on landed — reported as a tie. |
| 4 | Response curves, `conv = a·spend^b` | what does the next rupee buy? | Meta and Google fit well (R² 0.89 / 0.80). LinkedIn is weak at 0.39 and is flagged low-confidence. |
| 5 | Reallocation optimiser | where should the budget go? | +38% registrations/day at the same total. Correlational, not causal — see below. |
| 6 | Anomaly detection, detrended MAD z | what broke, and when? | Catches both planted incidents on their exact dates with no race-week false positives. |

## Things worth knowing before quoting any of this

- **The split is by date, not random.** A random split puts sessions from the same day on
  both sides of the split. Day-level demand drives conversion, so that leaks the future
  into training and inflates AUC.
- **The export is verified against sklearn.** `train.py` re-scores 200 held-out rows using
  only the exported JSON, in pure Python, and asserts the maximum absolute difference from
  `predict_proba` is under 1e-9. If that assert ever fires, fix the export, not the assert.
- **Response curves control for demand.** Fitting `log(conv)` on `log(spend)` alone gives
  Google an elasticity of 1.88 — increasing returns to ad spend, which no auction can do.
  It is an omitted-variable artefact: budgets rise as the event nears and so does demand.
  Trend, race-day proximity and day of week are included so the elasticity is identified
  within demand.
- **An elasticity outside (0, 1] is clamped and flagged**, not silently used.
- **The optimiser cannot prove causation.** The curves are fitted on observational spend.
  Channels were never randomised. Moves are capped at 20–250% of current spend, and a
  channel with R² below 0.25 is not allowed to receive budget at all.
- **MAD, not mean/σ, and detrended.** A spike inflates σ enough to hide itself. And the
  z-score is taken on the ratio to a 31-day centred rolling median: with a 15-day window
  an 8-day incident is over half the baseline and raises it along with itself.
- **Nothing calls `datetime.now()` or an unseeded RNG.** Seed 20260823. The same data
  produces the same metrics every run.

## Rerun

```
python train.py
```

Requires numpy, pandas, scikit-learn — see `requirements.txt`. Takes about a minute.
