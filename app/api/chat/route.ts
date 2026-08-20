// AI Analyst. Gemini answers questions about the season from a compact aggregate
// context built here.
//
// The context is aggregated, never row-level. 76k rows will not fit in a prompt, and
// pasting a sample would be worse than useless: the model would answer confidently from
// whichever thousand rows happened to be included. Everything below is a total, a rate,
// or a top-N — figures the model can quote without arithmetic.

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { funnelRows, mlBundle } from "@/lib/csv";
import { atLevel, byEntity, daily, totalsFor } from "@/lib/data";
import { CHANNEL_LABEL, EVENT_DATE, EVENT_NAME, GEMINI_MODEL, PAID_CHANNELS } from "@/lib/constants";
import type { MlBundle, Row } from "@/lib/types";

export const dynamic = "force-dynamic";

const inr = (n: number | null): string =>
  n == null || !isFinite(n) ? "n/a" : "Rs " + Math.round(n).toLocaleString("en-IN");
const int = (n: number | null): string =>
  n == null || !isFinite(n) ? "n/a" : Math.round(n).toLocaleString("en-IN");
const pc = (n: number | null): string => (n == null || !isFinite(n) ? "n/a" : n.toFixed(2) + "%");
const x = (n: number | null): string => (n == null || !isFinite(n) ? "n/a" : n.toFixed(2) + "x");

function topLines(rows: Row[], level: string, n: number, by: "spend" | "ROAS"): string {
  const ents = byEntity(atLevel(rows, level), by === "spend" ? "spend" : "ROAS")
    .filter((e) => e.spend > 500)
    .slice(0, n);
  return ents
    .map(
      (e) =>
        "  " + e.entity + " | spend " + inr(e.spend) + " | regs " + int(e.conversions) +
        " | GTV " + inr(e.gtv) + " | ROAS " + x(e.ROAS) + " | CAC " + inr(e.CPA)
    )
    .join("\n");
}

function buildContext(): string {
  const rows = funnelRows();
  if (!rows.length) return "NO DATA AVAILABLE.";

  const overall = totalsFor(atLevel(rows, "overall"));
  const chRows = atLevel(rows, "channel");
  const paidSpend = chRows.reduce((a, r) => a + r.spend, 0);
  const paidGtv = chRows.filter((r) => PAID_CHANNELS.includes(r.channel)).reduce((a, r) => a + r.gtv, 0);
  const dates = rows.map((r) => r.c_date);
  const L: string[] = [];

  L.push("EVENT: " + EVENT_NAME + ". Race day " + EVENT_DATE + ".");
  L.push("SEASON: " + dates[0] + " to " + dates[dates.length - 1] + ".");
  L.push("");
  L.push("SEASON TOTALS");
  L.push("  landed " + int(overall.landed) + ", leads " + int(overall.lead_submitted) +
    ", pay initiated " + int(overall.pay_now_attempt) + ", registrations " + int(overall.conversions));
  L.push("  GTV " + inr(overall.gtv) + ", paid spend " + inr(paidSpend) + ", AOV " + inr(overall.AOV));
  L.push("  funnel: landed->lead " + pc(overall.L2L) + ", lead->pay " + pc(overall.L2P) +
    ", pay->registration " + pc(overall.P2C) + ", landed->registration " + pc(overall.L2C));
  L.push("  blended ROAS " + x(overall.gtv / paidSpend) + " (all GTV over paid spend)");
  L.push("  paid-only ROAS " + x(paidGtv / paidSpend) + " (GTV from paid channels only)");
  L.push("");
  L.push("BY CHANNEL");
  for (const e of byEntity(chRows, "spend")) {
    L.push(
      "  " + e.entity + " | spend " + inr(e.spend) + " | landed " + int(e.landed) +
      " | leads " + int(e.lead_submitted) + " | regs " + int(e.conversions) +
      " | GTV " + inr(e.gtv) + " | ROAS " + x(e.ROAS) + " | CAC " + inr(e.CPA) +
      " | landed->reg " + pc(e.L2C)
    );
  }
  L.push("");
  L.push("BY CITY");
  for (const e of byEntity(atLevel(rows, "city"), "gtv")) {
    L.push("  " + e.entity + " | landed " + int(e.landed) + " | regs " + int(e.conversions) +
      " | GTV " + inr(e.gtv) + " | landed->reg " + pc(e.L2C) + " | AOV " + inr(e.AOV));
  }
  L.push("");
  L.push("TICKET MIX");
  for (const e of byEntity(atLevel(rows, "product"), "gtv")) {
    L.push("  " + e.entity + " | regs " + int(e.conversions) + " | GTV " + inr(e.gtv));
  }
  L.push("");
  L.push("TOP 10 META CAMPAIGNS BY SPEND");
  L.push(topLines(rows, "meta_campaign", 10, "spend"));
  L.push("TOP 10 GOOGLE CAMPAIGNS BY SPEND");
  L.push(topLines(rows, "google_campaign", 10, "spend"));
  L.push("LINKEDIN CAMPAIGNS");
  L.push(topLines(rows, "linkedin_campaign", 8, "spend"));
  L.push("PRINT PUBLICATIONS");
  L.push(topLines(rows, "print_campaign", 8, "spend"));
  L.push("");
  L.push("LAST 14 DAYS (overall)");
  for (const d of daily(atLevel(rows, "overall")).slice(-14)) {
    L.push("  " + d.c_date + " | landed " + int(d.landed) + " | leads " + int(d.lead_submitted) +
      " | regs " + int(d.conversions) + " | GTV " + inr(d.gtv) + " | landed->reg " + pc(d.L2C));
  }

  const ml = mlBundle() as MlBundle | null;
  if (ml) {
    L.push("");
    L.push("MODEL RESULTS (held-out)");
    L.push("  conversion propensity: AUC " + ml.propensity.metrics.auc.toFixed(4) +
      ", average precision " + ml.propensity.metrics.average_precision.toFixed(4) +
      ", positive rate " + pc(ml.propensity.metrics.positive_rate * 100));
    for (const f of ml.forecasts) {
      L.push("  forecast " + f.metric + ": backtest MAPE " + f.backtest.mape.toFixed(2) +
        "% vs seasonal-naive " + f.baseline_mape.seasonal_naive.toFixed(2) +
        "%, projected total at race day " + int(f.projected_total));
    }
    for (const c of ml.curves) {
      L.push("  response curve " + c.channel + ": elasticity " + c.b.toFixed(3) +
        ", R2 " + c.r2.toFixed(3) + ", average CPA " + inr(c.average_cpa) +
        ", marginal CPA " + inr(c.marginal_cpa));
    }
    L.push("  budget optimiser: " + ml.reallocation.lift_pct.toFixed(1) +
      "% more registrations per day at the same total budget. Moves: " +
      ml.reallocation.moves
        .map((m) => m.channel + " " + (m.delta >= 0 ? "+" : "") + Math.round(m.delta_pct) + "%")
        .join(", "));
    L.push("  KNOWN DATA INCIDENTS: Google lead events stopped firing 18-20 May 2026" +
      " (landed->lead fell to about 3.8% from about 12.9%); a crawler inflated organic" +
      " Hyderabad landings roughly 2.3x from 25 Jun to 2 Jul 2026 with almost no" +
      " registrations behind it.");
  }
  return L.join("\n");
}

const SYSTEM = [
  "You are a senior marketing analyst for the " + EVENT_NAME + ", a running event.",
  "Answer only from the CONTEXT below. Quote the real figures from it.",
  "If the context does not contain what was asked, say so plainly and name what would be needed.",
  "Never invent or estimate a number that is not in the context.",
  "Be direct and specific. Lead with the answer, then the evidence. Two or three short",
  "paragraphs or a short bullet list is usually right. Use Rs for rupees.",
  "Distinguish blended ROAS from paid-only ROAS whenever ROAS is discussed.",
  "When recommending a budget change, cite marginal CPA rather than average CPA, and say",
  "that the response curves are fitted on observational spend and cannot prove causation.",
].join(" ");

interface Msg {
  role: string;
  content: string;
}

let cachedContext: string | null = null;

export async function POST(req: Request) {
  let messages: Msg[] = [];
  try {
    const body = (await req.json()) as { messages?: Msg[] };
    messages = body.messages ?? [];
  } catch {
    return NextResponse.json({ reply: "I could not read that request.", degraded: true });
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({
      reply: "This view needs a Gemini API key to be configured. Every other view is unaffected.",
      degraded: true,
      reason: "NO_KEY",
    });
  }

  if (!cachedContext) cachedContext = buildContext();

  try {
    const genai = new GoogleGenerativeAI(key);
    const model = genai.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM + "\n\nCONTEXT\n" + cachedContext,
    });
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const last = messages[messages.length - 1]?.content ?? "";
    const chat = model.startChat({ history });
    const res = await chat.sendMessage(last);
    return NextResponse.json({ reply: res.response.text() });
  } catch (e) {
    // The SDK error is a wall of JSON with a stack trace in it. Useful in a log, wrong in
    // a user interface: classify it into something a reader can act on and keep the raw
    // text in a separate field for anyone debugging.
    const raw = e instanceof Error ? e.message : String(e);
    let reply =
      "The language model could not be reached. Every other view reads the data directly " +
      "and is unaffected.";
    let reason = "UPSTREAM_ERROR";
    if (/API_KEY_INVALID|API key not valid/i.test(raw)) {
      reply =
        "The configured API key was rejected. It needs to be replaced with a valid Gemini " +
        "key for this view to work. Every other view is unaffected.";
      reason = "KEY_REJECTED";
    } else if (/RESOURCE_EXHAUSTED|quota|429/i.test(raw)) {
      reply =
        "The API quota for this key has been used up. It will reset, or a key with more " +
        "headroom can be configured. Every other view is unaffected.";
      reason = "QUOTA";
    } else if (/PERMISSION_DENIED|403/i.test(raw)) {
      reply =
        "The API key exists but is not permitted to call this model. Every other view is " +
        "unaffected.";
      reason = "FORBIDDEN";
    }
    return NextResponse.json({ reply, degraded: true, reason, detail: raw.slice(0, 400) });
  }
}
