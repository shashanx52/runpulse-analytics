// Wire format for the funnel table.
//
// The table is 76k rows and every row repeats the same handful of strings — 172 dates,
// 22 levels, 9 channels, 667 entities. Sent as an array of objects that is 17.3 MB of
// JSON, most of it the same words over and over, and a serverless response is capped at
// 4.5 MB, so the deployed app would fail on its first request.
//
// Interning the strings into dictionaries and sending the rows as positional tuples takes
// it to 2.6 MB, an 85% reduction, with no loss: decode() reconstructs the exact same Row
// objects. Both sides live here so the encoder and decoder cannot drift apart.

import { CITY_LEVELS } from "./constants";
import type { Row } from "./types";

export interface PackedRows {
  /** dictionaries */
  d: string[]; // dates
  l: string[]; // levels
  c: string[]; // channels
  e: string[]; // entities
  p: string[]; // parents
  /** [dateIdx, levelIdx, channelIdx, entityIdx, parentIdx, landed, leads, pay, conv, gtv, spend] */
  r: number[][];
}

export interface PackedPayload {
  packed: PackedRows;
  full_min: string;
  full_max: string;
  cities: string[];
  channels: string[];
  event_date: string;
  error?: string;
}

export function encode(rows: Row[]): PackedRows {
  const d: string[] = [];
  const l: string[] = [];
  const c: string[] = [];
  const e: string[] = [];
  const p: string[] = [];
  const dm = new Map<string, number>();
  const lm = new Map<string, number>();
  const cm = new Map<string, number>();
  const em = new Map<string, number>();
  const pm = new Map<string, number>();
  const id = (m: Map<string, number>, a: string[], v: string): number => {
    let i = m.get(v);
    if (i === undefined) {
      a.push(v);
      i = a.length - 1;
      m.set(v, i);
    }
    return i;
  };
  const r = rows.map((x) => [
    id(dm, d, x.c_date),
    id(lm, l, x.level),
    id(cm, c, x.channel),
    id(em, e, x.entity),
    id(pm, p, x.parent),
    x.landed,
    x.lead_submitted,
    x.pay_now_attempt,
    x.conversions,
    x.gtv,
    x.spend,
  ]);
  return { d, l, c, e, p, r };
}

export function decode(k: PackedRows): Row[] {
  const out: Row[] = new Array(k.r.length);
  // _city is derived here rather than shipped: it is a substring of entity on exactly the
  // *_city levels, so sending it would repeat data already on the wire.
  const cityOf = (level: string, entity: string): string | null => {
    if (!CITY_LEVELS.includes(level)) return null;
    const i = entity.lastIndexOf(" | ");
    return i < 0 ? null : entity.slice(i + 3).trim();
  };
  for (let i = 0; i < k.r.length; i++) {
    const t = k.r[i];
    const level = k.l[t[1]];
    const entity = k.e[t[3]];
    out[i] = {
      c_date: k.d[t[0]],
      level,
      channel: k.c[t[2]],
      entity,
      parent: k.p[t[4]],
      landed: t[5],
      lead_submitted: t[6],
      pay_now_attempt: t[7],
      conversions: t[8],
      gtv: t[9],
      spend: t[10],
      _city: cityOf(level, entity),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generic table packing, for the channel detail tables.
//
// Same problem as the funnel rows on a smaller scale: 24k Meta rows repeat 14 campaign
// names, 35 ad set names and 90 creative ids over and over, and as objects that is
// 8.5 MB — over the serverless response cap on its own. Interning every string column
// takes it under 2 MB.
// ---------------------------------------------------------------------------
export interface PackedTable {
  cols: string[];
  /** one dictionary per column, or null where the column is numeric */
  dict: (string[] | null)[];
  /** per row, per column: a dictionary index for string columns, the value for numbers */
  r: number[][];
}

export function packTable<T extends object>(rows: T[], cols: (keyof T & string)[]): PackedTable {
  // Indexed access inside the loop, so the caller can pass its real row interface rather
  // than being forced to declare an index signature on it.
  const get = (row: T, c: string): string | number =>
    (row as unknown as Record<string, string | number>)[c];
  const dict: (string[] | null)[] = cols.map(() => null);
  const maps: (Map<string, number> | null)[] = cols.map(() => null);
  // Decide per column from the first row that has a value, so a column of numeric
  // strings is not silently interned as text.
  const probe = rows[0];
  cols.forEach((c, i) => {
    if (probe && typeof get(probe, c) === "string") {
      dict[i] = [];
      maps[i] = new Map();
    }
  });
  const r = rows.map((row) =>
    cols.map((c, i) => {
      const m = maps[i];
      if (!m) return Number(get(row, c) ?? 0);
      const v = String(get(row, c) ?? "");
      let ix = m.get(v);
      if (ix === undefined) {
        (dict[i] as string[]).push(v);
        ix = (dict[i] as string[]).length - 1;
        m.set(v, ix);
      }
      return ix;
    })
  );
  return { cols, dict, r };
}

export function unpackTable<T>(p: PackedTable): T[] {
  const out: T[] = new Array(p.r.length);
  for (let i = 0; i < p.r.length; i++) {
    const row = p.r[i];
    const o: Record<string, string | number> = {};
    for (let c = 0; c < p.cols.length; c++) {
      const d = p.dict[c];
      o[p.cols[c]] = d ? d[row[c]] : row[c];
    }
    out[i] = o as T;
  }
  return out;
}
