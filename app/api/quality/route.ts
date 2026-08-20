// Route handlers read only through lib/csv.ts, which parses each file once and caches
// it for the life of the process. Nothing here throws: a broken data directory should
// degrade the UI, not blank it.
import { NextResponse } from "next/server";
import { runChecks } from "@/lib/quality";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(runChecks());
  } catch (e) {
    return NextResponse.json({
      checks: [], incidents: [], reconciliation: [],
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
