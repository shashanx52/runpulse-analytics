// Route handlers read only through lib/csv.ts, which parses each file once and caches
// it for the life of the process. Nothing here throws: a broken data directory should
// degrade the UI, not blank it.
import { NextResponse } from "next/server";
import { mlBundle } from "@/lib/csv";

export const dynamic = "force-dynamic";

export async function GET() {
  const b = mlBundle();
  // The bundle is written by ml/train.py, which may simply not have been run yet. That
  // is a normal state for a fresh clone, so it gets a named error the tab can explain
  // rather than a 500.
  if (!b) return NextResponse.json({ error: "MODEL_NOT_TRAINED" });
  return NextResponse.json(b);
}
