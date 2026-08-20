"use client";

import { useMemo, useState } from "react";
import Icon from "./Icon";
import { fmtCell } from "@/lib/format";

export interface Col<T> {
  key: string;
  label: string;
  get: (r: T) => string | number | null;
  fmt?: (v: string | number | null, r: T) => string;
  align?: "left" | "right";
  width?: number;
}

type Dir = "desc" | "asc" | null;

export default function DataTable<T>({
  rows,
  cols,
  sortKey,
  maxRows,
  caption,
  dense,
}: {
  rows: T[];
  cols: Col<T>[];
  sortKey?: string;
  maxRows?: number;
  caption?: string;
  dense?: boolean;
}) {
  const [key, setKey] = useState<string | null>(sortKey ?? null);
  const [dir, setDir] = useState<Dir>(sortKey ? "desc" : null);
  const [all, setAll] = useState(false);

  const sorted = useMemo(() => {
    if (!key || !dir) return rows;
    const col = cols.find((c) => c.key === key);
    if (!col) return rows;
    // Decorate-sort-undecorate: pulls each cell value out once instead of on every
    // comparison, and carrying the original index keeps the sort stable.
    const dec = rows.map((r, i) => ({ r, i, v: col.get(r) }));
    dec.sort((a, b) => {
      // Nulls last in both directions. A row with no value is not the smallest, it is
      // unknown, and floating it to the top of an ascending sort is just noise.
      if (a.v == null && b.v == null) return a.i - b.i;
      if (a.v == null) return 1;
      if (b.v == null) return -1;
      let c: number;
      if (typeof a.v === "number" && typeof b.v === "number") c = a.v - b.v;
      else c = String(a.v).localeCompare(String(b.v), "en");
      if (c === 0) return a.i - b.i;
      return dir === "asc" ? c : -c;
    });
    return dec.map((d) => d.r);
  }, [rows, cols, key, dir]);

  const shown = maxRows && !all ? sorted.slice(0, maxRows) : sorted;

  function click(k: string) {
    if (k !== key) {
      setKey(k);
      setDir("desc");
      return;
    }
    // three states, so a reader can always get back to the original order
    if (dir === "desc") setDir("asc");
    else if (dir === "asc") {
      setDir(null);
      setKey(null);
    } else setDir("desc");
  }

  if (!rows.length) return <div className="empty">No rows for this selection.</div>;

  return (
    <>
      <div className="tbl-wrap">
        <table className={dense ? "tbl sortable dense" : "tbl sortable"}>
          <thead>
            <tr>
              {cols.map((c) => {
                const on = c.key === key && dir !== null;
                const classes = [c.align === "right" ? "r" : "", on ? "sorted" : ""]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <th
                    key={c.key}
                    className={classes}
                    style={c.width ? { width: c.width } : undefined}
                    onClick={() => click(c.key)}
                    aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}
                    title={"Sort by " + c.label}
                  >
                    {c.label}
                    {on ? (
                      <Icon
                        name={dir === "asc" ? "chevron-up" : "chevron-down"}
                        size={11}
                        style={{ display: "inline", marginLeft: 3, verticalAlign: "middle" }}
                      />
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => {
                  const v = c.get(r);
                  return (
                    <td key={c.key} className={c.align === "right" ? "r" : ""}>
                      <div className={c.align === "right" ? undefined : "ent"}>
                        {c.fmt ? c.fmt(v, r) : fmtCell(v)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? <div className="tbl-cap">{caption}</div> : null}
      {maxRows && sorted.length > maxRows ? (
        <div className="tbl-more">
          <button type="button" className="btn" onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : "Show all " + sorted.length.toLocaleString("en-IN")}
          </button>
        </div>
      ) : null}
    </>
  );
}
