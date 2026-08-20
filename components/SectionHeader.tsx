"use client";

export default function SectionHeader({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="sec-h">
      <div style={{ minWidth: 0 }}>
        <div className="sec-t">{title}</div>
        {sub ? <div className="sec-s">{sub}</div> : null}
      </div>
      <div className="spacer" />
      {right}
    </div>
  );
}
