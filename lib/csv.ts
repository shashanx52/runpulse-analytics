// Server-side CSV loaders. Files live in ./data and are read off disk, parsed once and
// cached in module scope for the life of the process — funnel_daily.csv is 8 MB and
// re-parsing it per request is the difference between a 4 ms response and a 900 ms one.
//
// Node-only. Any module importing this must be a route handler or otherwise
// server-only, never a client component.

import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { CITY_LEVELS } from "./constants";
import type { GoogleRow, LinkedInRow, MetaRow, PrintRow, Row } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function readCsv<T extends Record<string, unknown>>(file: string): T[] {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  const body = fs.readFileSync(p, "utf8");
  const parsed = Papa.parse<Record<string, string>>(body, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  return parsed.data as unknown as T[];
}

function num(v: unknown): number {
  if (v === "" || v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[, ₹]/g, ""));
  return isFinite(n) ? n : 0;
}

/**
 * Normalise anything date-shaped to ISO. The generator writes ISO already, but a CSV
 * that has been through a spreadsheet comes back as M/D/YYYY, and string-sorting that
 * puts 9 August after 18 August. Normalising on the way in is the only place this can be
 * fixed once.
 */
function toIso(v: string): string | null {
  const s = (v || "").trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/** the *_city levels encode "<parent> | <city>" in entity; pull the city back out */
function cityOf(level: string, entity: string): string | null {
  if (!CITY_LEVELS.includes(level)) return null;
  const i = entity.lastIndexOf(" | ");
  return i < 0 ? null : entity.slice(i + 3).trim();
}

let _funnel: Row[] | null = null;
export function funnelRows(): Row[] {
  if (_funnel) return _funnel;
  const raw = readCsv<Record<string, string>>("funnel_daily.csv");
  const out: Row[] = [];
  for (const r of raw) {
    const c_date = toIso(r["c_date"]);
    if (!c_date) continue;
    const level = (r["level"] || "").trim();
    const entity = (r["entity"] || "").trim();
    out.push({
      c_date,
      level,
      channel: (r["channel"] || "").trim(),
      entity,
      parent: (r["parent"] || "").trim(),
      landed: num(r["landed"]),
      lead_submitted: num(r["lead_submitted"]),
      pay_now_attempt: num(r["pay_now_attempt"]),
      conversions: num(r["conversions"]),
      gtv: num(r["gtv"]),
      spend: num(r["spend"]),
      _city: cityOf(level, entity),
    });
  }
  out.sort((a, b) => a.c_date.localeCompare(b.c_date));
  _funnel = out;
  return out;
}

let _meta: MetaRow[] | null = null;
export function metaRows(): MetaRow[] {
  if (_meta) return _meta;
  _meta = readCsv<Record<string, string>>("meta_ads_daily.csv")
    .map((r) => ({
      date: toIso(r["date"]) || "",
      campaign_name: (r["campaign_name"] || "").trim(),
      adset_name: (r["adset_name"] || "").trim(),
      creative: (r["creative"] || "").trim(),
      creative_type: (r["creative_type"] || "").trim(),
      objective: (r["objective"] || "").trim(),
      city: (r["city"] || "").trim(),
      spend: num(r["spend"]),
      impressions: num(r["impressions"]),
      reach: num(r["reach"]),
      clicks: num(r["clicks"]),
      landed: num(r["landed"]),
      lead_submitted: num(r["lead_submitted"]),
      pay_now_attempt: num(r["pay_now_attempt"]),
      conversions: num(r["conversions"]),
      gtv: num(r["gtv"]),
    }))
    .filter((r) => r.date);
  return _meta;
}

let _google: GoogleRow[] | null = null;
export function googleRows(): GoogleRow[] {
  if (_google) return _google;
  _google = readCsv<Record<string, string>>("google_ads_daily.csv")
    .map((r) => ({
      date: toIso(r["date"]) || "",
      campaign_name: (r["campaign_name"] || "").trim(),
      campaign_type: (r["campaign_type"] || "").trim(),
      city: (r["city"] || "").trim(),
      spend: num(r["spend"]),
      impressions: num(r["impressions"]),
      clicks: num(r["clicks"]),
      landed: num(r["landed"]),
      lead_submitted: num(r["lead_submitted"]),
      pay_now_attempt: num(r["pay_now_attempt"]),
      conversions: num(r["conversions"]),
      gtv: num(r["gtv"]),
    }))
    .filter((r) => r.date);
  return _google;
}

let _linkedin: LinkedInRow[] | null = null;
export function linkedinRows(): LinkedInRow[] {
  if (_linkedin) return _linkedin;
  _linkedin = readCsv<Record<string, string>>("linkedin_ads_daily.csv")
    .map((r) => ({
      date: toIso(r["date"]) || "",
      campaign_name: (r["campaign_name"] || "").trim(),
      audience: (r["audience"] || "").trim(),
      objective: (r["objective"] || "").trim(),
      city: (r["city"] || "").trim(),
      spend: num(r["spend"]),
      impressions: num(r["impressions"]),
      clicks: num(r["clicks"]),
      landed: num(r["landed"]),
      lead_submitted: num(r["lead_submitted"]),
      pay_now_attempt: num(r["pay_now_attempt"]),
      conversions: num(r["conversions"]),
      gtv: num(r["gtv"]),
    }))
    .filter((r) => r.date);
  return _linkedin;
}

let _print: PrintRow[] | null = null;
export function printRows(): PrintRow[] {
  if (_print) return _print;
  _print = readCsv<Record<string, string>>("print_ads_daily.csv")
    .map((r) => ({
      date: toIso(r["date"]) || "",
      publication: (r["publication"] || "").trim(),
      slot: (r["slot"] || "").trim(),
      city: (r["city"] || "").trim(),
      spend: num(r["spend"]),
      estimated_reach: num(r["estimated_reach"]),
      landed: num(r["landed"]),
      lead_submitted: num(r["lead_submitted"]),
      pay_now_attempt: num(r["pay_now_attempt"]),
      conversions: num(r["conversions"]),
      gtv: num(r["gtv"]),
    }))
    .filter((r) => r.date);
  return _print;
}

export interface RunManifest {
  seed: number;
  season: { start: string; end: string; days: number; event_date: string };
  rows: Record<string, number>;
  totals: Record<string, number>;
  planted_incidents: Record<string, unknown>;
}

export function manifest(): RunManifest | null {
  const p = path.join(DATA_DIR, "meta.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as RunManifest;
  } catch {
    return null;
  }
}

/** ml/models/bundle.json, written by ml/train.py. Null until training has been run. */
export function mlBundle(): unknown | null {
  const p = path.join(process.cwd(), "ml", "models", "bundle.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
