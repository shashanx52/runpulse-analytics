"use client";

import { useMemo } from "react";
import { useTheme } from "@/lib/theme";
import { channelColor, CHANNEL_LABEL } from "@/lib/constants";
import { fmtByUnit } from "@/lib/format";
import { groupBy } from "@/lib/data";
import type { Row } from "@/lib/types";

const UNIT: Record<string, string> = {
  spend: "rupee",
  gtv: "rupee",
  conversions: "count",
  landed: "count",
};

export default function ChannelMix({
  rows,
  metric = "spend",
  height,
}: {
  rows: Row[];
  metric?: "spend" | "gtv" | "conversions" | "landed";
  height?: number;
}) {
  const { theme } = useTheme();
  const parts = useMemo(() => {
    const g = groupBy(rows, (r) => r.channel || "other");
    const out = [...g.entries()]
      .map(([ch, d]) => ({ ch, v: d[metric] as number }))
      .filter((p) => p.v > 0)
      .sort((a, b) => b.v - a.v);
    const tot = out.reduce((a, b) => a + b.v, 0);
    return out.map((p) => ({ ...p, pct: tot > 0 ? (p.v / tot) * 100 : 0 }));
  }, [rows, metric]);

  if (!parts.length) return <div className="empty">Nothing to split on {metric}.</div>;

  return (
    <div style={height ? { minHeight: height } : undefined}>
      <div className="mix-bar">
        {parts.map((p) => (
          <div
            key={p.ch}
            className="mix-seg"
            style={{ width: p.pct + "%", background: channelColor(theme, p.ch) }}
            title={(CHANNEL_LABEL[p.ch] ?? p.ch) + " " + p.pct.toFixed(1) + "%"}
          />
        ))}
      </div>
      <div className="mix-leg">
        {parts.map((p) => (
          <span key={p.ch}>
            <span className="mix-key" style={{ background: channelColor(theme, p.ch) }} />
            {CHANNEL_LABEL[p.ch] ?? p.ch} {p.pct.toFixed(1)}%
            <span className="muted"> · {fmtByUnit(p.v, UNIT[metric])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
