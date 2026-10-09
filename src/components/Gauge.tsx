// Half-circle gauge (0..1), like the main app's win-rate and profit-factor dials.
export function Gauge({ value, size = 44 }: { value: number | null; size?: number }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  const r = 18, c = Math.PI * r;
  const color = value === null ? "#3a3f48" : v >= 0.5 ? "var(--green)" : "var(--red)";
  return (
    <svg viewBox="0 0 44 26" width={size} height={(size * 26) / 44} aria-hidden>
      <path d="M4 22 A18 18 0 0 1 40 22" fill="none" stroke="#262b33" strokeWidth="5" strokeLinecap="round" />
      <path d="M4 22 A18 18 0 0 1 40 22" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${v * c} ${c}`} />
    </svg>
  );
}
