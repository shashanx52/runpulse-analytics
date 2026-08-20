"use client";

import Icon from "./Icon";
import { useTheme } from "@/lib/theme";
import { THEMES } from "@/lib/constants";
import type { ViewDef } from "@/lib/constants";

export type Period =
  | "All time"
  | "Last 7 days"
  | "Last 14 days"
  | "Last 30 days"
  | "Yesterday"
  | "Custom range";

export const PERIODS: Period[] = [
  "All time",
  "Last 30 days",
  "Last 14 days",
  "Last 7 days",
  "Yesterday",
  "Custom range",
];

export default function TopNav({
  views,
  view,
  setView,
  period,
  setPeriod,
  custom,
  setCustom,
  fullMin,
  fullMax,
  city,
  setCity,
  cities,
  onRefresh,
}: {
  views: ViewDef[];
  view: string;
  setView: (v: string) => void;
  period: Period;
  setPeriod: (p: Period) => void;
  custom: { start: string; end: string };
  setCustom: (c: { start: string; end: string }) => void;
  fullMin: string;
  fullMax: string;
  city: string;
  setCity: (c: string) => void;
  cities: string[];
  onRefresh: () => void;
}) {
  const { theme, cycle } = useTheme();

  return (
    <div className="topnav">
      <div className="topnav-in">
        <div className="row">
          <div className="brand">
            RunPulse
            <span className="brand-dot" />
            <span className="brand-sub">Velocity Run Series 2026</span>
          </div>
          <div className="spacer" />

          <select
            className="inp"
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            aria-label="Date period"
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {period === "Custom range" ? (
            <span className="row-tight">
              <input
                type="date"
                className="inp"
                value={custom.start}
                min={fullMin}
                max={fullMax}
                onChange={(e) => setCustom({ ...custom, start: e.target.value })}
                aria-label="Start date"
              />
              <span className="muted">to</span>
              <input
                type="date"
                className="inp"
                value={custom.end}
                min={fullMin}
                max={fullMax}
                onChange={(e) => setCustom({ ...custom, end: e.target.value })}
                aria-label="End date"
              />
            </span>
          ) : null}

          <select
            className="inp"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            aria-label="City filter"
          >
            <option>All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn"
            onClick={cycle}
            title={"Theme: " + theme.label}
            aria-label={"Switch theme, currently " + theme.label}
          >
            <Icon name={THEMES[theme.key].icon} size={14} />
          </button>
          <button type="button" className="btn" onClick={onRefresh} title="Reload the data">
            <Icon name="refresh" size={14} />
          </button>
        </div>

        <nav className="navrow" aria-label="Sections">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              className={v.key === view ? "navbtn active" : "navbtn"}
              onClick={() => setView(v.key)}
              title={v.hint}
              aria-current={v.key === view ? "page" : undefined}
            >
              <Icon name={v.icon} size={14} />
              {v.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
