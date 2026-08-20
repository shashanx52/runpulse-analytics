"use client";

import { useTheme } from "@/lib/theme";
import { fmtInt, fmtPct } from "@/lib/format";
import type { Derived } from "@/lib/types";

export default function FunnelChart({ totals, height }: { totals: Derived; height?: number }) {
  const { theme } = useTheme();
  const stages = [
    { label: "Landed", v: totals.landed },
    { label: "Leads", v: totals.lead_submitted },
    { label: "Pay initiated", v: totals.pay_now_attempt },
    { label: "Registrations", v: totals.conversions },
  ];
  const steps = [totals.L2L, totals.L2P, totals.P2C];
  const top = stages[0].v;

  if (!top) return <div className="empty">No funnel activity in this selection.</div>;

  return (
    <div style={height ? { minHeight: height } : undefined}>
      {stages.map((s, i) => (
        <div key={s.label}>
          <div className="fn-row">
            <div className="fn-lab">{s.label}</div>
            <div
              className="fn-bar"
              style={{
                // share of the widest stage, floored so a tiny stage is still visible
                width: Math.max(2, (s.v / top) * 100) + "%",
                background: theme.FUNNEL[i],
              }}
            >
              {fmtInt(s.v)}
            </div>
          </div>
          {i < steps.length ? (
            <div className="fn-step">
              {fmtPct(steps[i])} continue to {stages[i + 1].label.toLowerCase()}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
