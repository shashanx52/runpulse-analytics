"use client";

import Icon from "./Icon";
import { daysBetween } from "@/lib/data";

export default function Hero({
  icon,
  label,
  hint,
  dateLabel,
  city,
  eventDate,
  maxd,
}: {
  icon: string;
  label: string;
  hint?: string;
  dateLabel: string;
  city: string | null;
  eventDate: string;
  maxd: string;
}) {
  const toRace = maxd && eventDate ? daysBetween(maxd, eventDate) : null;
  const bits = [dateLabel, city ?? "All cities"];
  if (toRace != null && toRace >= 0) {
    bits.push(toRace === 0 ? "race day" : toRace + " days to race day");
  }
  return (
    <div className="hero">
      <div className="hero-ic">
        <Icon name={icon} size={19} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="hero-t">{label}</div>
        <div className="hero-s">{bits.filter(Boolean).join("  ·  ")}</div>
      </div>
      <div className="spacer" />
      {hint ? <div className="hero-s" style={{ textAlign: "right", maxWidth: 300 }}>{hint}</div> : null}
    </div>
  );
}
