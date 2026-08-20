"use client";

export default function StatGrid({
  items,
  cols = 4,
}: {
  items: { label: string; value: string; note?: string }[];
  cols?: number;
}) {
  if (!items.length) return null;
  return (
    <div className={`grid-${Math.min(4, Math.max(2, cols))}`}>
      {items.map((s) => (
        <div className="stat" key={s.label}>
          <div className="stat-l">{s.label}</div>
          <div className="stat-v">{s.value}</div>
          {s.note ? <div className="stat-n">{s.note}</div> : null}
        </div>
      ))}
    </div>
  );
}
