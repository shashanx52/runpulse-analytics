"use client";

import { useEffect, useState } from "react";

const STEPS = ["Loading", "Preparing metrics", "Almost there", "Ready"];

export default function RunLoader({ done, onDone }: { done: boolean; onDone: () => void }) {
  const [pct, setPct] = useState(6);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      // no animation to wait for; the loader is decorative, so hand over immediately
      if (done) onDone();
      return;
    }
    const t = setInterval(() => {
      setPct((p) => {
        // creep toward 90 while loading, then run to 100 once the data has arrived
        const target = done ? 100 : 90;
        const next = p + Math.max(1, (target - p) * 0.16);
        return next >= target ? target : next;
      });
    }, 60);
    return () => clearInterval(t);
  }, [done, onDone]);

  useEffect(() => {
    setStep(pct > 95 ? 3 : pct > 62 ? 2 : pct > 32 ? 1 : 0);
    if (done && pct >= 99.5) onDone();
  }, [pct, done, onDone]);

  return (
    <div className="loader">
      <div className="loader-in">
        <div className="brand" style={{ fontSize: 26 }}>
          RunPulse<span className="brand-dot" />
        </div>
        <div className="loader-track">
          <div className="loader-fill" style={{ width: pct + "%" }} />
        </div>
        <div className="loader-s">{STEPS[step]}</div>
      </div>
    </div>
  );
}
