// Route handlers read only through lib/csv.ts, which parses each file once and caches it
// for the life of the process. Nothing here throws: a broken data directory should degrade
// the UI, not blank it.

import { NextResponse } from "next/server";
import { funnelRows } from "@/lib/csv";
import { CITY_ORDER, EVENT_DATE } from "@/lib/constants";
import { encode, type PackedPayload } from "@/lib/pack";

export const dynamic = "force-dynamic";

const empty = (error?: string): PackedPayload => ({
  packed: { d: [], l: [], c: [], e: [], p: [], r: [] },
  full_min: "",
  full_max: "",
  cities: [],
  channels: [],
  event_date: EVENT_DATE,
  error,
});

export async function GET() {
  try {
    const rows = funnelRows();
    if (!rows.length) return NextResponse.json(empty("NO_DATA"));

    const cities = new Set<string>();
    const channels = new Set<string>();
    for (const r of rows) {
      if (r._city) cities.add(r._city);
      if (r.channel && r.channel !== "all") channels.add(r.channel);
    }
    return NextResponse.json({
      packed: encode(rows),
      full_min: rows[0].c_date,
      full_max: rows[rows.length - 1].c_date,
      cities: [...cities].sort((a, b) => CITY_ORDER.indexOf(a) - CITY_ORDER.indexOf(b)),
      channels: [...channels].sort(),
      event_date: EVENT_DATE,
    } satisfies PackedPayload);
  } catch (e) {
    return NextResponse.json(empty(e instanceof Error ? e.message : String(e)));
  }
}
