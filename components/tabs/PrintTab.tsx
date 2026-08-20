"use client";

import { useMemo, useState } from "react";
import KpiCards from "@/components/KpiCards";
import SectionHeader from "@/components/SectionHeader";
import Segmented from "@/components/Segmented";
import TrendChart from "@/components/TrendChart";
import DataTable, { type Col } from "@/components/DataTable";
import Callout from "@/components/Callout";
import { useTable } from "./ctx";
import { fmtInr, fmtInt, fmtNum, fmtPct, fmtRatio } from "@/lib/format";
import type { PrintRow, TabCtx } from "@/lib/types";

interface PrintAgg {
  key: string;
  insertions: number;
  spend: number;
  reach: number;
  landed: number;
  conversions: number;
  gtv: number;
  cpmReach: number | null;
  costPerLanding: number | null;
  roas: number | null;
  cac: number | null;
}

function agg(rows: PrintRow[], key: (r: PrintRow) => string): PrintAgg[] {
  const by = new Map<string, PrintAgg>();
  for (const r of rows) {
    const k = key(r);
    let o = by.get(k);
    if (!o) {
      o = {
        key: k, insertions: 0, spend: 0, reach: 0, landed: 0, conversions: 0, gtv: 0,
        cpmReach: null, costPerLanding: null, roas: null, cac: null,
      };
      by.set(k, o);
    }
    o.insertions += 1;
    o.spend += r.spend;
    o.reach += r.estimated_reach;
    o.landed += r.landed;
    o.conversions += r.conversions;
    o.gtv += r.gtv;
  }
  for (const o of by.values()) {
    o.cpmReach = o.reach > 0 ? (o.spend / o.reach) * 1000 : null;
    o.costPerLanding = o.landed > 0 ? o.spend / o.landed : null;
    o.roas = o.spend > 0 ? o.gtv / o.spend : null;
    o.cac = o.conversions > 0 ? o.spend / o.conversions : null;
  }
  return [...by.values()].sort((a, b) => b.spend - a.spend);
}

const DIMS = [
  { value: "publication", label: "Publication" },
  { value: "slot", label: "Slot" },
  { value: "city", label: "City" },
];

export default function PrintTab({ ctx }: { ctx: TabCtx }) {
  const { rows: all, loading, error } = useTable<PrintRow>("/api/print");
  const [dim, setDim] = useState("publication");

  const view = useMemo(() => {
    const rows = all.filter(
      (r) => r.date >= ctx.start && r.date <= ctx.end && (!ctx.city || r.city === ctx.city)
    );
    const byDim = agg(rows, (r) => String(r[dim as keyof PrintRow] ?? ""));
    const tot = agg(rows, () => "all")[0] ?? null;
    const byPub = agg(rows, (r) => r.publication).map((p) => ({
      c_date: p.key,
      spend: p.spend,
      reach: p.reach,
    }));
    return { rows, byDim, tot, byPub };
  }, [all, ctx, dim]);

  if (loading) return <div className="skel" style={{ height: 320 }} />;
  if (error)
    return (
      <Callout tone="crit" title="Could not load the print schedule">
        {error}
      </Callout>
    );
  if (!view.rows.length || !view.tot)
    return (
      <div className="empty">
        No print insertions in this window. The schedule starts in April — widen the range.
      </div>
    );

  const t = view.tot;
  const kpis = [
    { label: "Insertions", value: fmtInt(t.insertions), delta: null, dir: "neu" as const },
    { label: "Spend", value: fmtInr(t.spend), delta: null, dir: "neu" as const },
    { label: "Estimated reach", value: fmtNum(t.reach), delta: null, dir: "neu" as const },
    {
      label: "Cost per 000 reach",
      value: fmtInr(t.cpmReach),
      delta: null,
      dir: "cost" as const,
      note: "the only comparable figure here",
    },
    { label: "Tracked landings", value: fmtInt(t.landed), delta: null, dir: "good" as const },
    { label: "Tracked registrations", value: fmtInt(t.conversions), delta: null, dir: "good" as const },
    {
      label: "Tracked ROAS",
      value: fmtRatio(t.roas),
      delta: null,
      dir: "good" as const,
      note: "a floor, not the effect",
    },
    { label: "Cost per landing", value: fmtInr(t.costPerLanding), delta: null, dir: "cost" as const },
  ];

  const cols: Col<PrintAgg>[] = [
    { key: "key", label: DIMS.find((d) => d.value === dim)?.label ?? "Entity", get: (r) => r.key },
    { key: "ins", label: "Insertions", get: (r) => r.insertions, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "spend", label: "Spend", get: (r) => r.spend, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "reach", label: "Est. reach", get: (r) => r.reach, fmt: (v) => fmtNum(v as number), align: "right" },
    { key: "cpm", label: "Cost/000 reach", get: (r) => r.cpmReach, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "landed", label: "Tracked landings", get: (r) => r.landed, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "cpl", label: "Cost/landing", get: (r) => r.costPerLanding, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "conv", label: "Tracked regs", get: (r) => r.conversions, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "gtv", label: "Tracked GTV", get: (r) => r.gtv, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "roas", label: "Tracked ROAS", get: (r) => r.roas, fmt: (v) => fmtRatio(v as number), align: "right" },
  ];

  const share =
    t.reach > 0 && t.landed > 0 ? (t.landed / t.reach) * 100 : null;

  return (
    <div className="stack">
      <KpiCards items={kpis} />

      <Callout tone="warn" title="Print cannot be judged on last-click ROAS, and this is why">
        A newspaper ad has no click. The only tracked path from print to a registration is
        a QR code, which caught {fmtInt(t.landed)} landings against{" "}
        {fmtNum(t.reach)} of estimated reach — {fmtPct(share, 3)} of the people who saw
        it. Everyone who read the ad and later searched the event by name was recorded as
        Google or Organic, so the {fmtRatio(t.roas)} shown above is a **floor** on print's
        contribution, not a measurement of it. Judge this channel on cost per thousand
        reach ({fmtInr(t.cpmReach)}) and on whether organic and brand-search volume moved
        after each insertion — not on the tracked figure.
      </Callout>

      <div className="sec">
        <SectionHeader
          title="Spend against reach by publication"
          sub="Rates are negotiated well below card rate, normal for an event trading part of the buy against sponsorship"
        />
        <div className="panel">
          <TrendChart
            data={view.byPub}
            xKey="c_date"
            bars={[
              { key: "spend", label: "Spend", unit: "rupee" },
              { key: "reach", label: "Estimated reach", unit: "count" },
            ]}
            height={270}
            caption="One bar pair per publication across the selected window."
          />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Schedule detail"
          sub={view.byDim.length + " rows at this level"}
          right={<Segmented options={DIMS} value={dim} onChange={setDim} size="sm" />}
        />
        <div className="panel">
          <DataTable rows={view.byDim} cols={cols} sortKey="spend" dense />
        </div>
      </div>
    </div>
  );
}
