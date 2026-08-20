// Synthetic data generator for RunPulse Analytics.
//
// The shape of the thing: simulate the campaign, then aggregate it. Every number the
// dashboard shows and every row the ML models train on comes out of one pass of the
// same generative process, so the aggregates and the training set can never disagree.
// Seeded, so a rebuild reproduces the dataset exactly.
//
//   node scripts/generate.mjs
//
// Writes into ./data:
//   funnel_daily.csv       long format, one row per day x level x entity
//   meta_ads_daily.csv     campaign x adset x creative x city
//   google_ads_daily.csv   campaign x city
//   linkedin_ads_daily.csv campaign x audience x city
//   print_ads_daily.csv    publication x slot x city
//   sessions.csv           80,000-row stratified sample for model training
//   ticket_products.csv    the price ladder
//   meta.json              run manifest: seed, row counts, planted incidents

import fs from "node:fs";
import path from "node:path";
import {
  SEASON_START, SEASON_END, EVENT_DATE, CITIES, DEVICES, PRODUCTS, CHANNELS,
  META_CAMPAIGNS, META_SEGMENTS, CREATIVE_TYPES, CREATIVE_THEMES,
  GOOGLE_CAMPAIGNS, LINKEDIN_CAMPAIGNS, LINKEDIN_AUDIENCES,
  PUBLICATIONS, PRINT_SLOTS, SOURCES, EMAIL_CAMPAIGNS, INCIDENTS,
} from "./config.mjs";

const OUT = path.join(process.cwd(), "data");
const SEED = 20260823;
const SESSION_TARGET = 80000;

// ---------------------------------------------------------------------------
// deterministic randomness
// ---------------------------------------------------------------------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
let gaussSpare = null;
function gauss() {
  if (gaussSpare !== null) { const s = gaussSpare; gaussSpare = null; return s; }
  let u = 0, v = 0, s = 0;
  do { u = rnd() * 2 - 1; v = rnd() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1);
  const m = Math.sqrt((-2 * Math.log(s)) / s);
  gaussSpare = v * m;
  return u * m;
}
/** binomial draw; exact for small n, normal-approximated above 40 for speed */
function binom(n, p) {
  n = Math.floor(n);
  if (n <= 0) return 0;
  p = Math.min(1, Math.max(0, p));
  if (p <= 0) return 0;
  if (n < 40) { let k = 0; for (let i = 0; i < n; i++) if (rnd() < p) k++; return k; }
  const m = n * p, s = Math.sqrt(n * p * (1 - p));
  return Math.max(0, Math.min(n, Math.round(m + s * gauss())));
}
const jitter = (sd) => Math.max(0.05, 1 + gauss() * sd);
/**
 * Effective CPM after auction saturation. Buying more of the same audience on the same
 * day costs more per impression, so a channel's landings grow like spend^(1-sat).
 */
function effCpm(ch, daySpend) {
  const c = CHANNELS[ch];
  if (!c.sat || daySpend <= 0) return c.cpm;
  return c.cpm * Math.pow(daySpend / c.ref, c.sat);
}
function pick(items, weightKey = "share") {
  const tot = items.reduce((a, b) => a + b[weightKey], 0);
  let r = rnd() * tot;
  for (const it of items) { r -= it[weightKey]; if (r <= 0) return it; }
  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// dates
// ---------------------------------------------------------------------------
const MS = 86400000;
const toDate = (s) => new Date(s + "T00:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((toDate(b) - toDate(a)) / MS);
function dateList(from, to) {
  const out = [];
  for (let t = toDate(from).getTime(); t <= toDate(to).getTime(); t += MS) out.push(iso(new Date(t)));
  return out;
}
const DATES = dateList(SEASON_START, SEASON_END);

/**
 * Per-channel daily budget multiplier, independent of demand.
 *
 * Without this every channel's spend is a deterministic function of the demand index,
 * which makes spend perfectly collinear with the trend and ramp controls used when
 * fitting response curves — the spend elasticity is then not separately identified and
 * the fit returns whatever the collinearity leaves behind. Real accounts are nothing
 * like that clean: budgets get raised and cut by hand, pacing overshoots and corrects,
 * cards decline, someone pauses a campaign on a Friday. A slow random walk with the
 * occasional step change reproduces that, and it is what makes the elasticity estimable.
 */
function budgetWalk() {
  const out = {};
  for (const ch of ["meta", "google", "linkedin", "print"]) {
    let m = 1;
    const series = [];
    for (let i = 0; i < DATES.length; i++) {
      m *= Math.exp(gauss() * 0.075);
      if (rnd() < 0.045) m *= 1 + (rnd() - 0.5) * 0.7; // a hand-made budget change
      m = Math.min(1.85, Math.max(0.5, m));
      series.push(m);
    }
    // Re-centre on 1. Multiplicative noise whose arithmetic mean is 1 has a geometric
    // mean below 1, so an uncorrected walk drifts steadily downward — the first run of
    // this lost 31% of the season's spend and inflated ROAS from 4.5x to 5.6x purely as
    // an artefact. Normalising keeps the variation and removes the drift.
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    out[ch] = series.map((v) => v / mean);
  }
  return out;
}
const BUDGET_WALK = budgetWalk();
const walkAt = (ch, d) => BUDGET_WALK[ch][DATES.indexOf(d)] ?? 1;
const between = (d, from, to) => d >= from && d <= to;

// consumer fitness: weekends browse, Monday and Tuesday are dead
const DOW_MULT = [1.14, 0.9, 0.93, 0.99, 1.02, 1.09, 1.2]; // Sun..Sat
// price-rise deadlines. Every one of these produces a real spike in a real event.
const DEADLINES = ["2026-04-30", "2026-05-15", "2026-06-30", "2026-08-05"];

/** demand index for a day: weekly rhythm, an event-date ramp, deadline spikes, drift */
function demandIndex(d) {
  const dow = toDate(d).getUTCDay();
  const dte = Math.max(0, dayDiff(d, EVENT_DATE));
  const ramp = 1 + 2.45 * Math.exp(-dte / 15);            // the closing surge
  const early = 1 + 0.5 * Math.exp(-dayDiff(SEASON_START, d) / 12); // launch buzz
  let spike = 1;
  for (const dl of DEADLINES) {
    const gap = dayDiff(d, dl);
    if (gap >= 0 && gap <= 3) spike *= 1 + 0.42 * (1 - gap / 4);
  }
  const trend = 1 + 0.0022 * dayDiff(SEASON_START, d);
  return DOW_MULT[dow] * ramp * early * spike * trend;
}
/** urgency lifts conversion, not just traffic — people commit near the date */
function urgencyMult(d) {
  const dte = Math.max(0, dayDiff(d, EVENT_DATE));
  return 1 + 0.72 * Math.exp(-dte / 22);
}

// ---------------------------------------------------------------------------
// aggregation sink
// ---------------------------------------------------------------------------
const agg = new Map();
function add(c_date, level, channel, entity, parent, m) {
  const k = `${c_date}|${level}|${channel}|${entity}|${parent}`;
  let o = agg.get(k);
  if (!o) {
    o = { c_date, level, channel, entity, parent, landed: 0, lead_submitted: 0,
          pay_now_attempt: 0, conversions: 0, gtv: 0, spend: 0 };
    agg.set(k, o);
  }
  o.landed += m.landed || 0;
  o.lead_submitted += m.lead || 0;
  o.pay_now_attempt += m.pay || 0;
  o.conversions += m.conv || 0;
  o.gtv += m.gtv || 0;
  o.spend += m.spend || 0;
  return o;
}

// detail tables
const metaRows = [], googleRows = [], linkedinRows = [], printRows = [];
// day -> mix of realised cells, used to draw the ML session sample
const dayCells = new Map();

// ---------------------------------------------------------------------------
// creative inventory: adsets and ads per Meta campaign, each ad on a rotation
// ---------------------------------------------------------------------------
function buildMetaInventory() {
  const inv = [];
  let adNo = 0;
  for (const c of META_CAMPAIGNS) {
    const nSets = 2 + Math.floor(rnd() * 2); // 2 or 3
    const segs = [...META_SEGMENTS].sort(() => rnd() - 0.5).slice(0, nSets);
    const span = dayDiff(c.from, c.to) + 1;
    for (const seg of segs) {
      const adset = `${c.name}__as_${seg}`;
      const nAds = 2 + Math.floor(rnd() * 2); // 2 or 3
      const ads = [];
      for (let i = 0; i < nAds; i++) {
        const ct = pick(CREATIVE_TYPES);
        const theme = CREATIVE_THEMES[Math.floor(rnd() * CREATIVE_THEMES.length)];
        // creative rotation: each ad lives 28-70 days inside its campaign window
        const life = Math.min(span, 28 + Math.floor(rnd() * 43));
        const startOff = Math.floor(rnd() * Math.max(1, span - life + 1));
        const from = iso(new Date(toDate(c.from).getTime() + startOff * MS));
        const to = iso(new Date(toDate(from).getTime() + (life - 1) * MS));
        ads.push({
          id: `crt_${String(++adNo).padStart(3, "0")}_${ct.name}_${theme}`,
          type: ct, theme, from, to: to > c.to ? c.to : to,
          w: 0.6 + rnd() * 0.8,
        });
      }
      inv.push({ campaign: c, adset, segment: seg, w: 0.6 + rnd() * 0.8, ads });
    }
  }
  return inv;
}
const META_INV = buildMetaInventory();

// city split for a campaign: a geo-targeted one concentrates, a national one
// follows the population shares
function citySplit(targetCity) {
  const out = [];
  if (!targetCity) {
    for (const c of CITIES) out.push({ city: c, w: c.share * jitter(0.1) });
  } else {
    for (const c of CITIES) {
      const w = c.name === targetCity ? 0.78 : c.share * 0.22;
      out.push({ city: c, w: w * jitter(0.12) });
    }
  }
  const tot = out.reduce((a, b) => a + b.w, 0);
  for (const o of out) o.w /= tot;
  return out;
}

// ---------------------------------------------------------------------------
// funnel probabilities for one cell
// ---------------------------------------------------------------------------
function funnelFor(d, ch, city, opts = {}) {
  const u = urgencyMult(d);
  const q = CHANNELS[ch].q * (opts.qMult ?? 1);
  const pLead = Math.min(0.62, 0.088 * q * (opts.convMult ?? 1) * u * jitter(0.07));
  const pPay = Math.min(0.78, 0.315 * (0.9 + 0.2 * (q / 1.2)) * u * jitter(0.06));
  const pConv = Math.min(0.92, 0.53 * (opts.devMult ?? 1) * (0.94 + 0.12 * (q / 1.2)) * jitter(0.05));
  return { pLead, pPay, pConv };
}

/** run a cell of landings through the funnel and post it to every level it belongs to */
function runCell({ d, ch, city, landed, spend, levels, opts = {} }) {
  if (landed <= 0 && spend <= 0) return null;
  const { pLead, pPay, pConv } = funnelFor(d, ch, city, opts);

  let lead = binom(landed, pLead);
  // planted incident: lead events stop firing on one channel for three days
  const lo = INCIDENTS.leadOutage;
  if (ch === lo.channel && between(d, lo.from, lo.to)) lead = Math.round(lead * lo.leadMult);

  const pay = binom(lead, pPay);
  const conv = binom(pay, pConv);

  // ticket mix, tilted by city wealth and by how close the event is
  let gtv = 0;
  const prodCount = new Map();
  for (let i = 0; i < conv; i++) {
    const p = pick(PRODUCTS.map((x) => ({ ...x, share: x.share * (x.price > 2000 ? city.wealth : 1) })));
    gtv += p.price * (rnd() < 0.06 ? 2 : 1); // the occasional two-bib order
    prodCount.set(p.code, (prodCount.get(p.code) || 0) + 1);
  }

  const m = { landed, lead, pay, conv, gtv, spend };
  for (const [level, entity, parent] of levels) add(d, level, ch, entity, parent, m);
  return { ...m, prodCount };
}

// ---------------------------------------------------------------------------
// the main pass
// ---------------------------------------------------------------------------
const dailyTotals = [];

for (const d of DATES) {
  const di = demandIndex(d);
  const dow = toDate(d).getUTCDay();
  const dte = Math.max(0, dayDiff(d, EVENT_DATE));
  const cells = [];
  const dayAcc = { landed: 0, lead: 0, pay: 0, conv: 0, gtv: 0, spend: 0 };
  // Ad platforms restate the last few days of spend upward after the fact. Applied here,
  // at source, so the funnel table and the raw channel exports carry the same number --
  // an earlier version scaled only the aggregates and left a 0.18% gap between the two,
  // which is exactly the kind of discrepancy a reconciliation check exists to refuse.
  const restate =
    dayDiff(d, SEASON_END) < INCIDENTS.spendRestate.days ? INCIDENTS.spendRestate.mult : 1;

  // ---------- Meta -------------------------------------------------------
  {
    const budget = 150000 * (0.62 + 0.55 * (di / 2.4)) * walkAt("meta", d) * restate * jitter(0.1);
    const cpmToday = effCpm("meta", budget);
    const active = META_INV.filter((s) => between(d, s.campaign.from, s.campaign.to));
    const wTot = active.reduce((a, s) => a + s.campaign.budget * s.w, 0) || 1;
    for (const s of active) {
      const c = s.campaign;
      const setSpend = budget * ((c.budget * s.w) / wTot);
      const liveAds = s.ads.filter((a) => between(d, a.from, a.to));
      if (!liveAds.length) continue;
      const awTot = liveAds.reduce((a, x) => a + x.w, 0);
      const split = citySplit(c.city);
      for (const ad of liveAds) {
        const adSpend = setSpend * (ad.w / awTot);
        // creative fatigue: CTR decays with days on air, hard for the one campaign
        // flagged fatigueFrom
        const age = dayDiff(ad.from, d);
        let fat = Math.pow(ad.type.fatigue, age / 30);
        if (c.fatigueFrom && d >= c.fatigueFrom) fat *= 0.42;
        for (const { city, w } of split) {
          const spend = adSpend * w;
          if (spend < 1) continue;
          const imp = (spend / cpmToday) * 1000 * jitter(0.08);
          const ctr = CHANNELS.meta.ctr * ad.type.ctrMult * fat * jitter(0.12);
          const landed = binom(imp, ctr);
          const dev = pick(DEVICES);
          const r = runCell({
            d, ch: "meta", city, landed, spend,
            opts: { convMult: ad.type.convMult, devMult: dev.convMult },
            levels: [
              ["meta_campaign", c.name, "meta"],
              ["meta_campaign_city", `${c.name} | ${city.name}`, c.name],
              ["meta_adset", s.adset, c.name],
              ["meta_ad", `${ad.id} | ${s.segment}`, s.adset],
              ["meta_creative_type", ad.type.name, "meta"],
            ],
          });
          if (!r) continue;
          metaRows.push({
            date: d, campaign_name: c.name, adset_name: s.adset, creative: ad.id,
            creative_type: ad.type.name, objective: c.objective, city: city.name,
            spend: +spend.toFixed(2), impressions: Math.round(imp),
            reach: Math.round(imp * (0.54 + rnd() * 0.2)), clicks: landed,
            landed, lead_submitted: r.lead, pay_now_attempt: r.pay,
            conversions: r.conv, gtv: +r.gtv.toFixed(2),
          });
          cells.push({ ch: "meta", city, dev, landed, r, creative_type: ad.type.name,
                       campaign: c.name, objective: c.objective });
          for (const k of ["landed", "lead", "pay", "conv", "gtv", "spend"]) dayAcc[k] += r[k] || 0;
        }
      }
    }
  }

  // ---------- Google -----------------------------------------------------
  {
    const budget = 62000 * (0.66 + 0.52 * (di / 2.4)) * walkAt("google", d) * restate * jitter(0.09);
    const cpmToday = effCpm("google", budget);
    const active = GOOGLE_CAMPAIGNS.filter((c) => between(d, c.from, c.to));
    const wTot = active.reduce((a, c) => a + c.budget, 0) || 1;
    for (const c of active) {
      const campSpend = budget * (c.budget / wTot);
      for (const { city, w } of citySplit(c.city)) {
        const spend = campSpend * w;
        if (spend < 1) continue;
        const imp = (spend / cpmToday) * 1000 * jitter(0.08);
        const landed = binom(imp, CHANNELS.google.ctr * jitter(0.14));
        const dev = pick(DEVICES);
        const r = runCell({
          d, ch: "google", city, landed, spend,
          opts: { qMult: c.qMult, devMult: dev.convMult },
          levels: [
            ["google_campaign", c.name, "google"],
            ["google_campaign_city", `${c.name} | ${city.name}`, c.name],
          ],
        });
        if (!r) continue;
        googleRows.push({
          date: d, campaign_name: c.name, campaign_type: c.objective, city: city.name,
          spend: +spend.toFixed(2), impressions: Math.round(imp), clicks: landed,
          landed, lead_submitted: r.lead, pay_now_attempt: r.pay,
          conversions: r.conv, gtv: +r.gtv.toFixed(2),
        });
        cells.push({ ch: "google", city, dev, landed, r, creative_type: "search",
                     campaign: c.name, objective: c.objective });
        for (const k of ["landed", "lead", "pay", "conv", "gtv", "spend"]) dayAcc[k] += r[k] || 0;
      }
    }
  }

  // ---------- LinkedIn ---------------------------------------------------
  {
    const active = LINKEDIN_CAMPAIGNS.filter((c) => between(d, c.from, c.to));
    if (active.length) {
      const budget = 32000 * (0.8 + 0.3 * (di / 2.4)) * walkAt("linkedin", d) * restate * jitter(0.12);
      const cpmToday = effCpm("linkedin", budget);
      const wTot = active.reduce((a, c) => a + c.budget, 0) || 1;
      for (const c of active) {
        const campSpend = budget * (c.budget / wTot);
        const auds = LINKEDIN_AUDIENCES.filter(() => rnd() < 0.6);
        const use = auds.length ? auds : [LINKEDIN_AUDIENCES[0]];
        for (const aud of use) {
          const audSpend = campSpend / use.length;
          for (const { city, w } of citySplit(c.city)) {
            const spend = audSpend * w;
            if (spend < 1) continue;
            const imp = (spend / cpmToday) * 1000 * jitter(0.1);
            const landed = binom(imp, CHANNELS.linkedin.ctr * jitter(0.16));
            const dev = pick(DEVICES);
            // B2B: fewer, bigger orders — the corporate pack skews here
            const r = runCell({
              d, ch: "linkedin", city, landed, spend,
              opts: { convMult: 0.86, devMult: dev.convMult * 1.1 },
              levels: [
                ["linkedin_campaign", c.name, "linkedin"],
                ["linkedin_campaign_city", `${c.name} | ${city.name}`, c.name],
                ["linkedin_audience", aud, c.name],
              ],
            });
            if (!r) continue;
            linkedinRows.push({
              date: d, campaign_name: c.name, audience: aud, objective: c.objective,
              city: city.name, spend: +spend.toFixed(2), impressions: Math.round(imp),
              clicks: landed, landed, lead_submitted: r.lead, pay_now_attempt: r.pay,
              conversions: r.conv, gtv: +r.gtv.toFixed(2),
            });
            cells.push({ ch: "linkedin", city, dev, landed, r, creative_type: "sponsored",
                         campaign: c.name, objective: c.objective });
            for (const k of ["landed", "lead", "pay", "conv", "gtv", "spend"]) dayAcc[k] += r[k] || 0;
          }
        }
      }
    }
  }

  // ---------- Print ------------------------------------------------------
  // insertions, not a daily buy: Sundays plus the run-up to each deadline
  {
    const isInsertion = dow === 0 || DEADLINES.some((dl) => { const g = dayDiff(d, dl); return g >= 0 && g <= 2; });
    if (isInsertion && d >= "2026-04-01") {
      for (const pub of PUBLICATIONS) {
        if (rnd() > 0.55) continue;
        const slotDef = pick(PRINT_SLOTS, "w");
        const slot = slotDef.name;
        const sizeMult = slotDef.size;
        // events buy print at a heavily negotiated rate, often part-bartered against
        // sponsorship, so nobody pays the published card rate
        const spend = pub.rate * sizeMult * 0.45 * restate * jitter(0.06);
        const city = CITIES.find((c) => c.name === pub.city);
        // print has no click. A QR code carries a small, poorly-tracked trickle.
        const landed = binom(pub.reach * sizeMult, 0.0012 * jitter(0.3));
        const r = runCell({
          d, ch: "print", city, landed, spend,
          opts: { convMult: 0.8 },
          levels: [
            ["print_campaign", pub.name, "print"],
            ["print_campaign_city", `${pub.name} | ${city.name}`, pub.name],
          ],
        });
        if (!r) continue;
        printRows.push({
          date: d, publication: pub.name, slot, city: city.name,
          spend: +spend.toFixed(2), estimated_reach: Math.round(pub.reach * sizeMult),
          landed, lead_submitted: r.lead, pay_now_attempt: r.pay,
          conversions: r.conv, gtv: +r.gtv.toFixed(2),
        });
        cells.push({ ch: "print", city, dev: DEVICES[0], landed, r, creative_type: "print",
                     campaign: pub.name, objective: "awareness" });
        for (const k of ["landed", "lead", "pay", "conv", "gtv", "spend"]) dayAcc[k] += r[k] || 0;
      }
    }
  }

  // ---------- earned and owned: organic, email, referral, affiliate ------
  {
    const bases = { organic: 1850, email: 620, referral: 430, affiliate: 380 };
    for (const ch of ["organic", "email", "referral", "affiliate"]) {
      // organic rides on paid awareness, so it tracks the demand index closely
      const base = bases[ch] * di * jitter(0.13);
      for (const { city, w } of citySplit(null)) {
        let landed = binom(Math.round(base * 3), (base * w) / (base * 3));
        // planted incident: a crawler inflates one city's organic landings
        const bs = INCIDENTS.botSpike;
        if (ch === bs.channel && city.name === bs.city && between(d, bs.from, bs.to)) {
          landed = Math.round(landed * bs.landMult);
        }
        const dev = pick(DEVICES);
        const isBot = ch === bs.channel && city.name === bs.city && between(d, bs.from, bs.to);
        const r = runCell({
          d, ch, city, landed, spend: 0,
          // bot traffic lands and does nothing, which is exactly how it shows up
          opts: { devMult: dev.convMult, qMult: isBot ? 0.18 : 1 },
          levels: [],
        });
        if (!r) continue;
        cells.push({ ch, city, dev, landed, r, creative_type: "none",
                     campaign: ch === "email" ? null : null, objective: "organic" });
        for (const k of ["landed", "lead", "pay", "conv", "gtv", "spend"]) dayAcc[k] += r[k] || 0;
      }
    }
  }

  // ---------- email campaign attribution --------------------------------
  // email landings exist above at channel level; split them across the sends
  // that were live, so the Marketing tab has campaign-grain email rows
  {
    const emailCells = cells.filter((c) => c.ch === "email");
    const active = EMAIL_CAMPAIGNS.filter((c) => between(d, c.from, c.to));
    if (active.length && emailCells.length) {
      const wTot = active.reduce((a, c) => a + c.budget, 0);
      for (const c of active) {
        const sh = c.budget / wTot;
        const m = { landed: 0, lead: 0, pay: 0, conv: 0, gtv: 0, spend: 0 };
        for (const ec of emailCells) {
          m.landed += Math.round(ec.landed * sh);
          m.lead += Math.round(ec.r.lead * sh);
          m.pay += Math.round(ec.r.pay * sh);
          m.conv += Math.round(ec.r.conv * sh);
          m.gtv += ec.r.gtv * sh;
        }
        add(d, "email_campaign", "email", c.name, "email", m);
      }
    }
  }

  // ---------- roll every cell up to the shared levels --------------------
  {
    const byCh = new Map(), byCity = new Map(), byChCity = new Map();
    const bySrc = new Map(), bySrcCity = new Map(), byDev = new Map();
    const byProd = new Map(), byProdCity = new Map();
    const bump = (map, key, m, extra) => {
      let o = map.get(key);
      if (!o) { o = { landed: 0, lead: 0, pay: 0, conv: 0, gtv: 0, spend: 0, ...extra }; map.set(key, o); }
      o.landed += m.landed; o.lead += m.lead; o.pay += m.pay;
      o.conv += m.conv; o.gtv += m.gtv; o.spend += m.spend;
    };
    for (const c of cells) {
      const m = c.r;
      bump(byCh, c.ch, m);
      bump(byCity, c.city.name, m);
      bump(byChCity, `${c.ch}||${c.city.name}`, m, { ch: c.ch, city: c.city.name });
      bump(byDev, c.dev.name, m);
      // spread the cell across that channel's utm_sources
      const srcs = SOURCES.filter((s) => s.channel === c.ch);
      const sTot = srcs.reduce((a, s) => a + s.w, 0) || 1;
      for (const s of srcs) {
        const sh = s.w / sTot;
        const sm = { landed: Math.round(m.landed * sh), lead: Math.round(m.lead * sh),
                     pay: Math.round(m.pay * sh), conv: Math.round(m.conv * sh),
                     gtv: m.gtv * sh, spend: m.spend * sh };
        if (sm.landed === 0 && sm.spend === 0) continue;
        bump(bySrc, s.name, sm);
        bump(bySrcCity, `${s.name}||${c.city.name}`, sm, { src: s.name, city: c.city.name });
      }
      // ticket mix
      if (m.prodCount) {
        for (const [code, n] of m.prodCount) {
          const p = PRODUCTS.find((x) => x.code === code);
          const pm = { landed: 0, lead: 0, pay: 0, conv: n, gtv: p.price * n, spend: 0 };
          bump(byProd, code, pm);
          bump(byProdCity, `${code}||${c.city.name}`, pm, { code, city: c.city.name });
        }
      }
    }
    for (const [ch, m] of byCh) add(d, "channel", ch, CHANNELS[ch].label, "ALL", m);
    for (const [city, m] of byCity) add(d, "city", "all", city, "ALL", m);
    for (const [, m] of byChCity) add(d, "channel_city", m.ch, `${CHANNELS[m.ch].label} | ${m.city}`, CHANNELS[m.ch].label, m);
    for (const [dev, m] of byDev) add(d, "device", "all", dev, "ALL", m);
    for (const [src, m] of bySrc) add(d, "source", "all", src, "ALL", m);
    for (const [, m] of bySrcCity) add(d, "source_city", "all", `${m.src} | ${m.city}`, m.src, m);
    for (const [code, m] of byProd) add(d, "product", "all", PRODUCTS.find((p) => p.code === code).name, "ALL", m);
    for (const [, m] of byProdCity) {
      const nm = PRODUCTS.find((p) => p.code === m.code).name;
      add(d, "product_city", "all", `${nm} | ${m.city}`, nm, m);
    }
    add(d, "overall", "all", "ALL", "", dayAcc);
  }

  dayCells.set(d, cells);
  dailyTotals.push({ d, ...dayAcc, di, dte });
}

// ---------------------------------------------------------------------------
// ML training sample: 80k sessions drawn from the realised day mix, labelled by
// the same probability model that produced the aggregates
// ---------------------------------------------------------------------------
function buildSessions() {
  const totLanded = dailyTotals.reduce((a, x) => a + x.landed, 0);
  const rows = [];
  let sid = 0;
  for (const dt of dailyTotals) {
    const want = Math.round((dt.landed / totLanded) * SESSION_TARGET);
    if (want <= 0) continue;
    const cells = dayCells.get(dt.d) || [];
    const cellTot = cells.reduce((a, c) => a + c.landed, 0) || 1;
    for (let i = 0; i < want; i++) {
      // choose a cell in proportion to its landings
      let r = rnd() * cellTot, cell = cells[cells.length - 1];
      for (const c of cells) { r -= c.landed; if (r <= 0) { cell = c; break; } }
      if (!cell) continue;
      const dev = pick(DEVICES);
      const prod = pick(PRODUCTS);
      const dow = toDate(dt.d).getUTCDay();
      const isReturning = rnd() < 0.31 ? 1 : 0;
      const priorVisits = isReturning ? 1 + Math.floor(rnd() * 5) : 0;
      const depth = 1 + Math.floor(Math.pow(rnd(), 0.55) * 9);
      const dwell = Math.round(8 + Math.pow(rnd(), 0.5) * 250 * (1 + depth / 10));
      const srcs = SOURCES.filter((s) => s.channel === cell.ch);
      const src = srcs.length ? pick(srcs.map((s) => ({ ...s, share: s.w }))) : { name: cell.ch };
      const u = urgencyMult(dt.d);

      // the true response surface the models are asked to recover
      const zLead =
        -3.7 + 0.44 * Math.log(CHANNELS[cell.ch].q) + 0.36 * isReturning +
        0.128 * depth + 0.0021 * dwell + 0.33 * Math.log(u) +
        (dev.name === "desktop" ? 0.26 : dev.name === "tablet" ? 0.08 : 0) +
        (cell.city.wealth - 1) * 0.5 + gauss() * 0.34;
      const pLead = 1 / (1 + Math.exp(-zLead));
      const lead = rnd() < pLead ? 1 : 0;

      const zPay = -0.62 + 0.3 * Math.log(u) + 0.19 * isReturning +
        0.06 * depth - 0.00022 * prod.price + gauss() * 0.4;
      const pay = lead && rnd() < 1 / (1 + Math.exp(-zPay)) ? 1 : 0;

      const zConv = 0.42 + 0.34 * Math.log(prod.convMult) + 0.22 * Math.log(dev.convMult) +
        0.24 * Math.log(u) + 0.3 * isReturning - 0.00014 * prod.price + gauss() * 0.45;
      const conv = pay && rnd() < 1 / (1 + Math.exp(-zConv)) ? 1 : 0;

      rows.push({
        session_id: `s${String(++sid).padStart(6, "0")}`,
        date: dt.d,
        days_to_event: dt.dte,
        dow,
        is_weekend: dow === 0 || dow === 6 ? 1 : 0,
        channel: cell.ch,
        utm_source: src.name,
        campaign: cell.campaign || `${cell.ch}_untracked`,
        objective: cell.objective,
        city: cell.city.name,
        device: dev.name,
        creative_type: cell.creative_type,
        product_interest: prod.code,
        price_tier: prod.price >= 2500 ? "premium" : prod.price >= 1200 ? "mid" : "entry",
        ticket_price: prod.price,
        is_returning: isReturning,
        prior_visits: priorVisits,
        session_depth: depth,
        dwell_seconds: dwell,
        lead_submitted: lead,
        pay_now_attempt: pay,
        converted: conv,
        gtv: conv ? prod.price : 0,
      });
    }
  }
  return rows;
}
const sessions = buildSessions();

// ---------------------------------------------------------------------------
// write
// ---------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
const q = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function writeCsv(file, rows, cols) {
  const out = [cols.join(",")];
  for (const r of rows) out.push(cols.map((c) => q(r[c])).join(","));
  fs.writeFileSync(path.join(OUT, file), out.join("\n") + "\n");
  return rows.length;
}

const div = (a, b) => (b ? +((a / b) * 100).toFixed(2) : "");
const funnel = [...agg.values()]
  .filter((r) => r.landed || r.lead_submitted || r.conversions || r.gtv || r.spend)
  .sort((a, b) => (a.c_date === b.c_date
    ? a.level === b.level ? a.entity.localeCompare(b.entity) : a.level.localeCompare(b.level)
    : a.c_date.localeCompare(b.c_date)))
  .map((r) => ({
    ...r,
    gtv: Math.round(r.gtv),
    spend: Math.round(r.spend),
    landed_to_lead_pct: div(r.lead_submitted, r.landed),
    lead_to_pay_pct: div(r.pay_now_attempt, r.lead_submitted),
    pay_to_conv_pct: div(r.conversions, r.pay_now_attempt),
    roas: r.spend ? +(r.gtv / r.spend).toFixed(2) : "",
    cost_per_conversion: r.conversions && r.spend ? Math.round(r.spend / r.conversions) : "",
  }));

const counts = {};
counts.funnel_daily = writeCsv("funnel_daily.csv", funnel, [
  "c_date", "level", "channel", "entity", "parent", "landed", "lead_submitted",
  "pay_now_attempt", "conversions", "gtv", "spend", "landed_to_lead_pct",
  "lead_to_pay_pct", "pay_to_conv_pct", "roas", "cost_per_conversion",
]);
counts.meta_ads_daily = writeCsv("meta_ads_daily.csv", metaRows, [
  "date", "campaign_name", "adset_name", "creative", "creative_type", "objective",
  "city", "spend", "impressions", "reach", "clicks", "landed", "lead_submitted",
  "pay_now_attempt", "conversions", "gtv",
]);
counts.google_ads_daily = writeCsv("google_ads_daily.csv", googleRows, [
  "date", "campaign_name", "campaign_type", "city", "spend", "impressions", "clicks",
  "landed", "lead_submitted", "pay_now_attempt", "conversions", "gtv",
]);
counts.linkedin_ads_daily = writeCsv("linkedin_ads_daily.csv", linkedinRows, [
  "date", "campaign_name", "audience", "objective", "city", "spend", "impressions",
  "clicks", "landed", "lead_submitted", "pay_now_attempt", "conversions", "gtv",
]);
counts.print_ads_daily = writeCsv("print_ads_daily.csv", printRows, [
  "date", "publication", "slot", "city", "spend", "estimated_reach", "landed",
  "lead_submitted", "pay_now_attempt", "conversions", "gtv",
]);
counts.sessions = writeCsv("sessions.csv", sessions, [
  "session_id", "date", "days_to_event", "dow", "is_weekend", "channel", "utm_source",
  "campaign", "objective", "city", "device", "creative_type", "product_interest",
  "price_tier", "ticket_price", "is_returning", "prior_visits", "session_depth",
  "dwell_seconds", "lead_submitted", "pay_now_attempt", "converted", "gtv",
]);
counts.ticket_products = writeCsv("ticket_products.csv",
  PRODUCTS.map((p) => ({ code: p.code, name: p.name, price: p.price })),
  ["code", "name", "price"]);

const tot = funnel.filter((r) => r.level === "overall")
  .reduce((a, r) => ({ landed: a.landed + r.landed, leads: a.leads + r.lead_submitted,
    conv: a.conv + r.conversions, gtv: a.gtv + r.gtv }), { landed: 0, leads: 0, conv: 0, gtv: 0 });
const spend = funnel.filter((r) => r.level === "channel").reduce((a, r) => a + r.spend, 0);

fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify({
  generated_from: "scripts/generate.mjs", seed: SEED,
  season: { start: SEASON_START, end: SEASON_END, days: DATES.length, event_date: EVENT_DATE },
  rows: counts,
  totals: { ...tot, spend: Math.round(spend), roas: +(tot.gtv / spend).toFixed(2) },
  planted_incidents: INCIDENTS,
}, null, 2));

console.log("rows written");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(20)} ${v.toLocaleString("en-IN")}`);
console.log("season totals");
console.log(`  landed ${tot.landed.toLocaleString("en-IN")}  leads ${tot.leads.toLocaleString("en-IN")}  conversions ${tot.conv.toLocaleString("en-IN")}`);
console.log(`  gtv Rs ${tot.gtv.toLocaleString("en-IN")}  spend Rs ${Math.round(spend).toLocaleString("en-IN")}  roas ${(tot.gtv / spend).toFixed(2)}x`);
