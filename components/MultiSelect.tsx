"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";

export default function MultiSelect({
  label,
  options,
  value,
  onChange,
  max,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape. Both listeners are attached only while the
  // popover is open, so a page with several of these does not accumulate handlers.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (o: string) => {
    if (value.includes(o)) onChange(value.filter((v) => v !== o));
    else if (max == null || value.length < max) onChange([...value, o]);
  };

  return (
    <div className="ms" ref={box}>
      <button type="button" className="btn" onClick={() => setOpen((v) => !v)}>
        {label} · {value.length} selected
        <Icon name={open ? "chevron-up" : "chevron-down"} size={13} />
      </button>
      {open ? (
        <div className="ms-pop" role="listbox" aria-multiselectable>
          {options.map((o) => {
            const on = value.includes(o);
            const blocked = !on && max != null && value.length >= max;
            return (
              <label
                key={o}
                className="ms-opt"
                style={blocked ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={blocked}
                  onChange={() => toggle(o)}
                />
                <span className="ent">{o}</span>
              </label>
            );
          })}
          {!options.length ? <div className="ms-opt muted">nothing to choose</div> : null}
        </div>
      ) : null}
    </div>
  );
}
