"use client";

import Icon from "./Icon";
import { fmtDelta } from "@/lib/format";
import type { Dir, KpiItem } from "@/lib/types";

/**
 * Direction decides the colour, not the sign. A rising cost-per-acquisition is still an
 * upward arrow, but it is red — "cost" exists so a card can point up and read badly.
 */
function cls(delta: number, dir: Dir): string {
  if (dir === "neu") return "neu";
  const good = dir === "cost" ? delta < 0 : delta > 0;
  if (Math.abs(delta) < 0.05) return "neu";
  return good ? "up" : "down";
}

export default function KpiCards({ items, cols = 4 }: { items: KpiItem[]; cols?: number }) {
  if (!items.length) return null;
  return (
    <div className={`grid-${Math.min(4, Math.max(2, cols))}`}>
      {items.map((k) => {
        const d = k.delta;
        const showDelta = d != null && isFinite(d);
        return (
          <div className="kpi" key={k.label}>
            <div className="kpi-l" title={k.label}>
              {k.label}
            </div>
            <div className="kpi-v">{k.value}</div>
            {showDelta ? (
              <div className={`kpi-d ${cls(d, k.dir)}`}>
                <Icon name={d >= 0 ? "arrow-up" : "arrow-down"} size={12} />
                {fmtDelta(d)}
                {k.sub ? <span className="sub">{k.sub}</span> : null}
              </div>
            ) : null}
            {k.note ? <div className="kpi-note">{k.note}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
