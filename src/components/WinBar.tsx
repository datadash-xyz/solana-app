export function WinBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-dim">–</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[#1d2229]">
        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 50 ? "var(--green)" : "var(--red)" }} />
      </span>
      <span className="num">{pct.toFixed(1)}%</span>
    </span>
  );
}
