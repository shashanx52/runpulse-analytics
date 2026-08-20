"use client";

import Icon from "./Icon";

const ICON: Record<string, string> = {
  info: "info",
  good: "check",
  warn: "alert-triangle",
  crit: "alert-triangle",
};

export default function Callout({
  tone,
  title,
  children,
}: {
  tone: "info" | "good" | "warn" | "crit";
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`callout ${tone}`}>
      <span className="callout-ic">
        <Icon name={ICON[tone]} size={15} />
      </span>
      <span>
        {title ? <span className="callout-t">{title}</span> : null}
        {children}
      </span>
    </div>
  );
}
