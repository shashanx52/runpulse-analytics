"use client";

import { useMemo } from "react";
import KpiCards from "@/components/KpiCards";
import SectionHeader from "@/components/SectionHeader";
import TrendChart from "@/components/TrendChart";
import DataTable, { type Col } from "@/components/DataTable";
import Callout from "@/components/Callout";
import { addDays, atLevel, byEntity, filterDates, totalsFor } from "@/lib/data";
import { CITY_ORDER } from "@/lib/constants";
import { fmtInr, fmtInt, fmtPct } from "@/lib/format";
import type { TabCtx } from "@/lib/types";

interface ProdRow {
  ticket: string;
  regs: number;
  regShare: number;
  gtv: number;
  gtvShare: number;
  price: number | null;
  revPerReg: number | null;
}

interface ShiftRow {
  ticket: string;
  earlyShare: number;
  lateShare: number;
  shift: number;
}

export default function ProductTab({ ctx }: { ctx: TabCtx }) {
  const view = useMemo(() => {
    const prod = atLevel(ctx.rows, "product", ctx.city);
    const ents = byEntity(prod, "gtv");
    const totRegs = ents.reduce((a, e) => a + e.conversions, 0);
    const totGtv = ents.reduce((a, e) => a + e.gtv, 0);

    const rows: ProdRow[] = ents.map((e) => ({
      ticket: e.entity,
      regs: e.conversions,
      regShare: totRegs > 0 ? (e.conversions / totRegs) * 100 : 0,
      gtv: e.gtv,
      gtvShare: totGtv > 0 ? (e.gtv / totGtv) * 100 : 0,
      // the level stores GTV as price x registrations, so the implied price falls out
      price: e.conversions > 0 ? e.gtv / e.conversions : null,
      revPerReg: e.AOV,
    }));

    const cur = totalsFor(prod);
    const byVolume = [...rows].sort((a, b) => b.regs - a.regs)[0];
    const byRevenue = [...rows].sort((a, b) => b.gtv - a.gtv)[0];
    const top2 = [...rows].sort((a, b) => b.gtv - a.gtv).slice(0, 2);
    const top2Share = top2.reduce((a, r) => a + r.gtvShare, 0);

    // volume against revenue, one bar pair per ticket — the contrast is the point
    const contrast = rows.map((r) => ({
      c_date: r.ticket,
      regs: r.regs,
      gtv: r.gtv,
      revPerReg: r.revPerReg ?? 0,
    }));

    // ticket mix by city
    const pc = atLevel(ctx.rows, "product_city");
    const cities = [...new Set(pc.map((r) => r._city).filter((c): c is string => !!c))].sort(
      (a, b) => CITY_ORDER.indexOf(a) - CITY_ORDER.indexOf(b)
    );
    const cityMix = cities.map((c) => {
      const inCity = pc.filter((r) => r._city === c);
      const tot = inCity.reduce((a, r) => a + r.conversions, 0);
      const row: Record<string, number | string> = { c_date: c };
      for (const t of rows) {
        const n = inCity
          .filter((r) => r.parent === t.ticket)
          .reduce((a, r) => a + r.conversions, 0);
        row[t.ticket] = tot > 0 ? (n / tot) * 100 : 0;
      }
      return row;
    });

    // does the mix shift as race day gets closer? compare the first 30 days of the
    // season against the last 30 of the selected window
    const earlyEnd = addDays(ctx.fullMin, 29);
    const early = atLevel(filterDates(ctx.rowsFull, ctx.fullMin, earlyEnd), "product", ctx.city);
    const lateStart = addDays(ctx.maxd, -29);
    const late = atLevel(filterDates(ctx.rowsFull, lateStart, ctx.maxd), "product", ctx.city);
    const shareIn = (rs: typeof early): Map<string, number> => {
      const e = byEntity(rs, "conversions");
      const t = e.reduce((a, x) => a + x.conversions, 0);
      return new Map(e.map((x) => [x.entity, t > 0 ? (x.conversions / t) * 100 : 0]));
    };
    const se = shareIn(early);
    const sl = shareIn(late);
    const shifts: ShiftRow[] = rows
      .map((r) => {
        const a = se.get(r.ticket) ?? 0;
        const b = sl.get(r.ticket) ?? 0;
        return { ticket: r.ticket, earlyShare: a, lateShare: b, shift: b - a };
      })
      .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));

    return { rows, cur, byVolume, byRevenue, top2, top2Share, contrast, cityMix, shifts, earlyEnd, lateStart };
  }, [ctx]);

  if (!view.rows.length) return <div className="empty">No ticket data for this selection.</div>;

  const kpis = [
    { label: "Registrations", value: fmtInt(view.cur.conversions), delta: null, dir: "neu" as const },
    { label: "GTV", value: fmtInr(view.cur.gtv), delta: null, dir: "neu" as const },
    { label: "AOV", value: fmtInr(view.cur.AOV), delta: null, dir: "good" as const },
    {
      label: "Top by volume",
      value: view.byVolume.ticket,
      delta: null,
      dir: "neu" as const,
      note: fmtPct(view.byVolume.regShare) + " of registrations",
    },
    {
      label: "Top by revenue",
      value: view.byRevenue.ticket,
      delta: null,
      dir: "neu" as const,
      note: fmtPct(view.byRevenue.gtvShare) + " of GTV",
    },
    { label: "Ticket types", value: String(view.rows.length), delta: null, dir: "neu" as const },
  ];

  const cols: Col<ProdRow>[] = [
    { key: "ticket", label: "Ticket", get: (r) => r.ticket },
    { key: "price", label: "Price", get: (r) => r.price, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "regs", label: "Registrations", get: (r) => r.regs, fmt: (v) => fmtInt(v as number), align: "right" },
    { key: "rs", label: "% of regs", get: (r) => r.regShare, fmt: (v) => fmtPct(v as number), align: "right" },
    { key: "gtv", label: "GTV", get: (r) => r.gtv, fmt: (v) => fmtInr(v as number), align: "right" },
    { key: "gs", label: "% of GTV", get: (r) => r.gtvShare, fmt: (v) => fmtPct(v as number), align: "right" },
    {
      key: "lever",
      label: "GTV share − reg share",
      get: (r) => r.gtvShare - r.regShare,
      fmt: (v) => ((v as number) > 0 ? "+" : "") + fmtPct(v as number),
      align: "right",
    },
  ];

  const shiftCols: Col<ShiftRow>[] = [
    { key: "ticket", label: "Ticket", get: (r) => r.ticket },
    { key: "e", label: "First 30 days", get: (r) => r.earlyShare, fmt: (v) => fmtPct(v as number), align: "right" },
    { key: "l", label: "Last 30 days", get: (r) => r.lateShare, fmt: (v) => fmtPct(v as number), align: "right" },
    {
      key: "s",
      label: "Shift",
      get: (r) => r.shift,
      fmt: (v) => ((v as number) > 0 ? "+" : "") + fmtPct(v as number),
      align: "right",
    },
  ];

  const biggestShift = view.shifts[0];

  return (
    <div className="stack">
      <KpiCards items={kpis} cols={3} />

      <Callout tone="info" title="Revenue concentration">
        {view.top2.map((t) => t.ticket).join(" and ")} together carry{" "}
        {fmtPct(view.top2Share)} of GTV. The cheapest ticket dominates volume while the
        expensive ones dominate revenue per head, so a headline registration count and a
        headline revenue figure can move in opposite directions — worth checking which one
        a target is actually written against.
      </Callout>

      <div className="sec">
        <SectionHeader
          title="Volume against revenue"
          sub="Registrations and GTV per ticket, with revenue per registration on the right axis"
        />
        <div className="panel">
          <TrendChart
            data={view.contrast}
            bars={[
              { key: "regs", label: "Registrations", unit: "count" },
              { key: "gtv", label: "GTV", unit: "rupee" },
            ]}
            lines={[{ key: "revPerReg", label: "Revenue per registration", unit: "rupee", yAxis: "right" }]}
            height={290}
          />
        </div>
      </div>

      <div className="sec">
        <SectionHeader title="Ticket mix" sub="Sorted by the gap between revenue share and registration share" />
        <div className="panel">
          <DataTable rows={view.rows} cols={cols} sortKey="gtv" />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Mix by city"
          sub="Share of each city's registrations, so a city that buys longer distances stands out"
        />
        <div className="panel">
          <TrendChart
            data={view.cityMix}
            bars={view.rows.map((r) => ({ key: r.ticket, label: r.ticket, unit: "pct", stackId: "m" }))}
            height={280}
            caption="Each bar is one city, split by ticket share."
          />
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="How the mix moves toward race day"
          sub={"First 30 days of the season against the last 30 days ending " + ctx.maxd}
        />
        <div className="panel">
          <DataTable rows={view.shifts} cols={shiftCols} sortKey="s" dense />
        </div>
      </div>

      {biggestShift ? (
        <Callout tone={biggestShift.shift > 0 ? "good" : "warn"} title="Largest mix shift">
          {biggestShift.ticket} moved from {fmtPct(biggestShift.earlyShare)} of
          registrations early in the season to {fmtPct(biggestShift.lateShare)} in the last
          30 days, a shift of {fmtPct(biggestShift.shift)}. Late buyers behaving differently
          from early buyers is normal for a dated event; it matters because the revenue per
          registration attached to each ticket is not the same.
        </Callout>
      ) : null}
    </div>
  );
}
