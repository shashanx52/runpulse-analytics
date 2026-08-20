// Route handlers read only through lib/csv.ts, which parses each file once and caches it
// for the life of the process. Rows go out packed (see lib/pack.ts) because as plain
// objects this table exceeds the serverless response cap on its own.

import { NextResponse } from "next/server";
import { printRows } from "@/lib/csv";
import { packTable } from "@/lib/pack";

export const dynamic = "force-dynamic";

const COLS = [
  "date",
  "publication",
  "slot",
  "city",
  "spend",
  "estimated_reach",
  "landed",
  "lead_submitted",
  "pay_now_attempt",
  "conversions",
  "gtv"
] as const;

export async function GET() {
  try {
    return NextResponse.json({ table: packTable(printRows(), [...COLS]) });
  } catch (e) {
    return NextResponse.json({
      table: { cols: [], dict: [], r: [] },
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
