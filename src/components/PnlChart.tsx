import { money } from "@/lib/format";

// Cumulative realized PnL over time, drawn as an SVG area chart (server-rendered).
export function PnlChart({ series }: { series: { day: Date | string; pnl: number }[] }) {
  if (series.length < 2) return <div className="flex h-40 items-center justify-center text-sm text-dim">Not enough closed trades to chart yet.</div>;

  let run = 0;
  const pts = series.map((s) => ({ t: new Date(s.day).getTime(), v: (run += Number(s.pnl)) }));
  const W = 640, H = 170, P = 6;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  const vs = pts.map((p) => p.v);
  const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
  const x = (t: number) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(t1).toFixed(1)},${y(0).toFixed(1)} L${x(t0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const up = pts[pts.length - 1].v >= 0;
  const color = up ? "var(--green)" : "var(--red)";

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pnlfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="#262b33" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#pnlfill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-dim num">
        <span>{new Date(t0).toISOString().slice(0, 10)}</span>
        <span>
          Peak {money(hi)} · Low {money(lo)}
        </span>
        <span>{new Date(t1).toISOString().slice(0, 10)}</span>
      </div>
    </div>
  );
}
