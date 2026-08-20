"use client";

import { useMemo } from "react";
import SectionHeader from "@/components/SectionHeader";
import Callout from "@/components/Callout";
import KpiCards from "@/components/KpiCards";
import DataTable, { type Col } from "@/components/DataTable";
import Icon from "@/components/Icon";
import { useJson } from "./ctx";
import { fmtInr, fmtInt } from "@/lib/format";
import type { TabCtx } from "@/lib/types";

interface Check {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  expected: string;
  actual: string;
}
interface Incident {
  id: string;
  title: string;
  window: string;
  evidence: string;
  detected: boolean;
}
interface Recon {
  source: string;
  metric: string;
  detail: number;
  funnel: number;
  diff: number;
  pctDiff: number | null;
  tolerance: string;
}
interface Payload {
  checks: Check[];
  incidents: Incident[];
  reconciliation: Recon[];
  error?: string;
}

const BADGE: Record<string, string> = {
  pass: "badge badge-good",
  warn: "badge badge-warn",
  fail: "badge badge-crit",
};
const ICON: Record<string, string> = { pass: "check", warn: "alert-triangle", fail: "x" };

export default function QualityTab({ ctx }: { ctx: TabCtx }) {
  const { data, loading, error } = useJson<Payload>("/api/quality");

  const counts = useMemo(() => {
    const c = data?.checks ?? [];
    return {
      pass: c.filter((x) => x.status === "pass").length,
      warn: c.filter((x) => x.status === "warn").length,
      fail: c.filter((x) => x.status === "fail").length,
      total: c.length,
    };
  }, [data]);

  if (loading) return <div className="skel" style={{ height: 340 }} />;
  if (error)
    return (
      <Callout tone="crit" title="Could not run the checks">
        {error}
      </Callout>
    );
  if (data?.error === "NO_DATA")
    return (
      <Callout tone="warn" title="No data to check">
        The dataset could not be loaded.
      </Callout>
    );
  if (!data) return <div className="empty">No quality payload.</div>;

  const reconCols: Col<Recon>[] = [
    { key: "source", label: "Channel", get: (r) => r.source },
    { key: "metric", label: "Metric", get: (r) => r.metric },
    {
      key: "detail",
      label: "Channel report",
      get: (r) => r.detail,
      fmt: (v, r) => (r.metric === "spend" || r.metric === "gtv" ? fmtInr(v as number) : fmtInt(v as number)),
      align: "right",
    },
    {
      key: "funnel",
      label: "Funnel table",
      get: (r) => r.funnel,
      fmt: (v, r) => (r.metric === "spend" || r.metric === "gtv" ? fmtInr(v as number) : fmtInt(v as number)),
      align: "right",
    },
    {
      key: "diff",
      label: "Difference",
      get: (r) => r.diff,
      fmt: (v) => ((v as number) > 0 ? "+" : "") + fmtInt(v as number),
      align: "right",
    },
    {
      key: "pct",
      label: "%",
      get: (r) => r.pctDiff,
      fmt: (v) => (v == null ? "—" : (v as number).toFixed(3) + "%"),
      align: "right",
    },
    { key: "tol", label: "Tolerance", get: (r) => r.tolerance, align: "right" },
  ];

  const kpis = [
    { label: "Checks passed", value: counts.pass + " / " + counts.total, delta: null, dir: "neu" as const },
    { label: "Warnings", value: String(counts.warn), delta: null, dir: "neu" as const },
    { label: "Failures", value: String(counts.fail), delta: null, dir: "neu" as const },
    {
      label: "Faults detected",
      value: data.incidents.filter((i) => i.detected).length + " / " + data.incidents.length,
      delta: null,
      dir: "neu" as const,
    },
  ];

  return (
    <div className="stack">
      <KpiCards items={kpis} />

      <Callout tone="info" title="How to read this">
        Every check can genuinely fail, and each prints what it expected alongside what it
        measured — so a green tick can be judged rather than taken on trust.
      </Callout>

      <div className="sec">
        <SectionHeader title="Checks" sub="Run live against the CSVs on every request" />
        <div className="stack" style={{ gap: 10 }}>
          {data.checks.map((c) => (
            <div className="panel panel-tight" key={c.id}>
              <div className="row">
                <span className={c.status === "pass" ? "good" : c.status === "warn" ? "warn" : "crit"}>
                  <Icon name={ICON[c.status]} size={15} />
                </span>
                <strong style={{ fontSize: 13.5 }}>{c.title}</strong>
                <div className="spacer" />
                <span className={BADGE[c.status]}>{c.status}</span>
              </div>
              <div className="sec-s" style={{ marginTop: 6 }}>{c.detail}</div>
              <div className="row" style={{ marginTop: 8, gap: 16 }}>
                <span className="chip">expected: {c.expected}</span>
                <span className="chip">measured: {c.actual}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Reconciliation"
          sub="Each channel against the funnel table, with the tolerance shown rather than assumed"
        />
        <div className="panel">
          <DataTable rows={data.reconciliation} cols={reconCols} dense />
          <div className="tbl-cap">
            Money is stored rounded to whole rupees, so a small residual there is expected.
            Counts must agree exactly.
          </div>
        </div>
      </div>

      <div className="sec">
        <SectionHeader
          title="Known tracking faults"
          sub="Two faults in this season, and the measured evidence for each"
        />
        <div className="grid-2">
          {data.incidents.map((i) => (
            <div className="panel" key={i.id}>
              <div className="row">
                <strong style={{ fontSize: 13.5 }}>{i.title}</strong>
                <div className="spacer" />
                <span className={i.detected ? "badge badge-good" : "badge badge-crit"}>
                  {i.detected ? "detected" : "MISSED"}
                </span>
              </div>
              <div className="sec-s" style={{ marginTop: 4 }}>{i.window}</div>
              <div style={{ marginTop: 8, fontSize: 13, color: "var(--ink2)" }}>{i.evidence}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Callout tone={data.incidents.every((i) => i.detected) ? "good" : "crit"} title="What this proves">
            {data.incidents.every((i) => i.detected)
              ? "Both faults are surfaced by the checks above and by the anomaly scan on the Analysis tab, with the measured numbers shown rather than asserted. A monitor that cannot prove a catch on a fault you already know about is not worth trusting on one you do not."
              : "One of the two faults is no longer being caught, which is a regression in the monitoring rather than a change in the data."}
          </Callout>
        </div>
      </div>

    </div>
  );
}
