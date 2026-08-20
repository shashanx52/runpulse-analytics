"use client";

export default function Segmented({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className={`seg${size === "sm" ? " sm" : ""}`} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
