"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TopNav, { type Period } from "@/components/TopNav";
import Hero from "@/components/Hero";
import RunLoader from "@/components/RunLoader";
import Callout from "@/components/Callout";
import { VIEWS } from "@/lib/constants";
import { addDays, daysBetween, filterDates } from "@/lib/data";
import { decode, type PackedPayload } from "@/lib/pack";
import type { Row, TabCtx } from "@/lib/types";

import OverallTab from "@/components/tabs/OverallTab";
import MetaTab from "@/components/tabs/MetaTab";
import GoogleTab from "@/components/tabs/GoogleTab";
import LinkedInTab from "@/components/tabs/LinkedInTab";
import PrintTab from "@/components/tabs/PrintTab";
import MarketingTab from "@/components/tabs/MarketingTab";
import CityTab from "@/components/tabs/CityTab";
import ProductTab from "@/components/tabs/ProductTab";
import AnalysisTab from "@/components/tabs/AnalysisTab";
import ForecastTab from "@/components/tabs/ForecastTab";
import MlTab from "@/components/tabs/MlTab";
import QualityTab from "@/components/tabs/QualityTab";
import ChatbotTab from "@/components/tabs/ChatbotTab";

const maxStr = (a: string, b: string): string => (a > b ? a : b);

function resolveRange(
  period: Period,
  custom: { start: string; end: string },
  fullMin: string,
  fullMax: string
): { start: string; end: string } {
  if (period === "Custom range") {
    let s = custom.start || fullMin;
    let e = custom.end || fullMax;
    if (s > e) [s, e] = [e, s]; // tolerate an out-of-order pair rather than showing nothing
    return { start: s, end: e };
  }
  if (period === "All time") return { start: fullMin, end: fullMax };
  // "Yesterday" means the most recent day that has data, not the real calendar
  // yesterday — the pipeline always lags by a day and an empty screen is not useful.
  if (period === "Yesterday") return { start: fullMax, end: fullMax };
  const n = { "Last 7 days": 7, "Last 14 days": 14, "Last 30 days": 30 }[period];
  return { start: maxStr(fullMin, addDays(fullMax, -(n - 1))), end: fullMax };
}

export default function Page() {
  const [data, setData] = useState<PackedPayload | null>(null);
  const [rowsFull, setRowsFull] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);

  const [view, setView] = useState("overall");
  const [period, setPeriod] = useState<Period>("All time");
  const [custom, setCustom] = useState({ start: "", end: "" });
  const [city, setCity] = useState("All cities");

  const load = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch("/api/data", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: PackedPayload) => {
        setData(j);
        setRowsFull(decode(j.packed));
        if (j.error) setErr(j.error);
        if (j.full_min && j.full_max) setCustom({ start: j.full_min, end: j.full_max });
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const fullMin = data?.full_min ?? "";
  const fullMax = data?.full_max ?? "";
  const cityVal = city === "All cities" ? null : city;

  const { start, end } = useMemo(
    () => (fullMin && fullMax ? resolveRange(period, custom, fullMin, fullMax) : { start: "", end: "" }),
    [period, custom, fullMin, fullMax]
  );

  const rows = useMemo(
    () => (start && end ? filterDates(rowsFull, start, end) : []),
    [rowsFull, start, end]
  );

  const { mind, maxd } = useMemo(() => {
    if (!rows.length) return { mind: start, maxd: end };
    let lo = rows[0].c_date;
    let hi = rows[0].c_date;
    for (const r of rows) {
      if (r.c_date < lo) lo = r.c_date;
      if (r.c_date > hi) hi = r.c_date;
    }
    return { mind: lo, maxd: hi };
  }, [rows, start, end]);

  const ctx: TabCtx = {
    rows,
    rowsFull,
    start,
    end,
    mind,
    maxd,
    fullMin,
    fullMax,
    eventDate: data?.event_date ?? "2026-08-23",
    city: cityVal,
  };

  // first paint only: a later Refresh keeps the reader where they were
  if (!booted) return <RunLoader done={!loading} onDone={() => setBooted(true)} />;

  if (err === "NO_DATA" || (!loading && !rowsFull.length)) {
    return (
      <main className="maincol">
        <div className="hero">
          <div style={{ minWidth: 0 }}>
            <div className="hero-t">RunPulse Analytics</div>
            <div className="hero-s">No dataset found</div>
          </div>
        </div>
        <Callout tone="warn" title="No data available">
          The dataset could not be loaded. Check the connection and try again.
        </Callout>
      </main>
    );
  }

  if (err) {
    return (
      <main className="maincol">
        <div className="hero">
          <div className="hero-t">RunPulse Analytics</div>
        </div>
        <Callout tone="crit" title="Could not load the dataset">
          {err}
        </Callout>
      </main>
    );
  }

  const viewDef = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const dateLabel =
    mind && maxd ? mind + " to " + maxd + "  ·  " + (daysBetween(mind, maxd) + 1) + "d" : "";

  return (
    <>
      <TopNav
        views={VIEWS}
        view={view}
        setView={setView}
        period={period}
        setPeriod={setPeriod}
        custom={custom}
        setCustom={setCustom}
        fullMin={fullMin}
        fullMax={fullMax}
        city={city}
        setCity={setCity}
        cities={data?.cities ?? []}
        onRefresh={load}
      />
      <main className="maincol">
        <Hero
          icon={viewDef.icon}
          label={viewDef.label}
          hint={viewDef.hint}
          dateLabel={dateLabel}
          city={cityVal}
          eventDate={ctx.eventDate}
          maxd={maxd}
        />
        {!rows.length && view !== "chatbot" ? (
          <Callout tone="warn" title="Nothing in this date range">
            Widen the period above, or clear the city filter.
          </Callout>
        ) : view === "overall" ? (
          <OverallTab ctx={ctx} />
        ) : view === "meta" ? (
          <MetaTab ctx={ctx} />
        ) : view === "google" ? (
          <GoogleTab ctx={ctx} />
        ) : view === "linkedin" ? (
          <LinkedInTab ctx={ctx} />
        ) : view === "print" ? (
          <PrintTab ctx={ctx} />
        ) : view === "marketing" ? (
          <MarketingTab ctx={ctx} />
        ) : view === "city" ? (
          <CityTab ctx={ctx} />
        ) : view === "product" ? (
          <ProductTab ctx={ctx} />
        ) : view === "analysis" ? (
          <AnalysisTab ctx={ctx} />
        ) : view === "forecast" ? (
          <ForecastTab ctx={ctx} />
        ) : view === "ml" ? (
          <MlTab ctx={ctx} />
        ) : view === "quality" ? (
          <QualityTab ctx={ctx} />
        ) : view === "chatbot" ? (
          <ChatbotTab />
        ) : null}
      </main>
    </>
  );
}
