"use client";

import { useMemo } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useTheme } from "@/lib/theme";
import { fmtByUnit, fmtDay, fmtNum } from "@/lib/format";

export interface BarSpec {
  key: string;
  label: string;
  color?: string;
  unit?: string;
  stackId?: string;
}
export interface LineSpec {
  key: string;
  label: string;
  color?: string;
  unit?: string;
  dashed?: boolean;
  yAxis?: "left" | "right";
}
export interface BandSpec {
  loKey: string;
  hiKey: string;
  label: string;
  color?: string;
}

type Datum = Record<string, number | string | null>;

export default function TrendChart({
  data,
  bars = [],
  lines = [],
  bands = [],
  height = 280,
  xKey = "c_date",
  caption,
}: {
  data: Datum[];
  bars?: BarSpec[];
  lines?: LineSpec[];
  bands?: BandSpec[];
  height?: number;
  xKey?: string;
  caption?: string;
}) {
  const { theme } = useTheme();

  const nothing = useMemo(() => {
    if (!data.length) return true;
    const keys = [...bars.map((b) => b.key), ...lines.map((l) => l.key)];
    if (!keys.length) return true;
    // An all-zero series draws an empty grid with a flat line on the axis, which reads
    // as a broken chart rather than as "no activity". Say it in words instead.
    return !data.some((d) => keys.some((k) => typeof d[k] === "number" && (d[k] as number) !== 0));
  }, [data, bars, lines]);

  const needRight = lines.some((l) => l.yAxis === "right");
  // Recharts uses `name` for both the legend entry and the tooltip key, so series are
  // named by their human label and the unit lookup is keyed the same way.
  const unitOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const b of bars) m[b.label] = b.unit ?? "count";
    for (const l of lines) m[l.label] = l.unit ?? "count";
    return m;
  }, [bars, lines]);

  // 172 points is too many for one tick each; thin them so labels never collide
  const interval = Math.max(0, Math.ceil(data.length / 12) - 1);

  // fmtNum rounds to whole units, which is right for counts and useless for a chart of
  // regression coefficients: 0.95, 0.50 and 0.26 all render as "1" or "0". Pick the axis
  // precision from the magnitude actually present.
  const axisFmt = useMemo(() => {
    const keys = [...bars.map((b) => b.key), ...lines.map((l) => l.key)];
    let max = 0;
    for (const d of data) {
      for (const k of keys) {
        const v = d[k];
        if (typeof v === "number" && isFinite(v)) max = Math.max(max, Math.abs(v));
      }
    }
    if (max < 10) return (v: number) => v.toFixed(2);
    if (max < 100) return (v: number) => v.toFixed(1);
    return (v: number) => fmtNum(v);
  }, [data, bars, lines]);

  if (nothing) {
    return (
      <>
        <div className="empty" style={{ minHeight: Math.min(height, 160) }}>
          Nothing to plot for this selection.
        </div>
        {caption ? <div className="tbl-cap">{caption}</div> : null}
      </>
    );
  }

  return (
    <>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 6, right: needRight ? 8 : 14, bottom: 0, left: -6 }}>
            <CartesianGrid stroke={theme.GRID} vertical={false} />
            <XAxis
              dataKey={xKey}
              tickFormatter={(v: string) => fmtDay(v)}
              interval={interval}
              tick={{ fill: theme.MUTED, fontSize: 11 }}
              stroke={theme.AXIS}
            />
            <YAxis
              yAxisId="left"
              tickFormatter={axisFmt}
              tick={{ fill: theme.MUTED, fontSize: 11 }}
              stroke={theme.AXIS}
              width={54}
            />
            {needRight ? (
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v: number) => (Math.abs(v) < 10 ? v.toFixed(2) : fmtNum(v))}
                tick={{ fill: theme.MUTED, fontSize: 11 }}
                stroke={theme.AXIS}
                width={48}
              />
            ) : null}
            <Tooltip
              contentStyle={{
                background: theme.SURFACE,
                border: "1px solid " + theme.BORDER2,
                borderRadius: 8,
                fontSize: 12.5,
                color: theme.INK,
              }}
              labelFormatter={(v: string) => fmtDay(String(v))}
              formatter={(v: number | string, n: string) => [
                fmtByUnit(typeof v === "number" ? v : Number(v), unitOf[n] ?? "count"),
                n,
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: theme.INK2, paddingTop: 4 }}
              iconType="plainline"
            />
            {bands.map((b) => (
              <Area
                key={b.loKey + b.hiKey}
                yAxisId="left"
                type="monotone"
                dataKey={b.hiKey}
                stroke="none"
                fill={b.color ?? theme.ACCENT}
                fillOpacity={0.14}
                name={b.label}
                legendType="none"
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
            {bars.map((b, i) => (
              <Bar
                key={b.key}
                yAxisId="left"
                dataKey={b.key}
                name={b.label}
                stackId={b.stackId}
                fill={b.color ?? theme.CAT[i % theme.CAT.length]}
                radius={[3, 3, 0, 0]}
                maxBarSize={26}
                isAnimationActive={false}
              />
            ))}
            {lines.map((l, i) => (
              <Line
                key={l.key}
                yAxisId={l.yAxis ?? "left"}
                type="monotone"
                dataKey={l.key}
                name={l.label}
                stroke={l.color ?? theme.CAT[(bars.length + i) % theme.CAT.length]}
                strokeWidth={2}
                strokeDasharray={l.dashed ? "5 4" : undefined}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {caption ? <div className="tbl-cap">{caption}</div> : null}
    </>
  );
}
