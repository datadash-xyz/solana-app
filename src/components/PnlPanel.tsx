"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";

const RANGES = [
  { k: "1D", ms: 864e5, label: "Past day" },
  { k: "1W", ms: 7 * 864e5, label: "Past week" },
  { k: "1M", ms: 30 * 864e5, label: "Past month" },
  { k: "1Y", ms: 365 * 864e5, label: "Past year" },
  { k: "ALL", ms: Infinity, label: "All time" },
] as const;

// Realized PnL over a selectable range: the headline is the range total and the line is
// cumulative within the range, starting from zero (as on the main Datadash trader page).
export function PnlPanel({ series }: { series: { t: string; pnl: number }[] }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["k"]>("ALL");
  const r = RANGES.find((x) => x.k === range)!;

  const { pts, total, t0, t1 } = useMemo(() => {
    const now = Date.now();
    const from = r.ms === Infinity ? -Infinity : now - r.ms;
    const inRange = series.map((s) => ({ t: new Date(s.t).getTime(), v: s.pnl })).filter((s) => s.t >= from);
    let run = 0;
    const cum = inRange.map((s) => ({ t: s.t, v: (run += s.v) }));
    const start = r.ms === Infinity ? (cum[0]?.t ?? now) - 3600e3 : from;
    return { pts: [{ t: start, v: 0 }, ...cum, { t: now, v: run }], total: run, t0: start, t1: now };
  }, [series, r]);

  const W = 640, H = 200, P = 8;
  const vs = pts.map((p) => p.v);
  const lo = Math.min(0, ...vs), hi = Math.max(0, ...vs);
  const x = (t: number) => P + ((t - t0) / (t1 - t0 || 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * P);
  // Step line: realized PnL changes at the moment a position closes.
  let d = `M${x(pts[0].t).toFixed(1)},${y(pts[0].v).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) d += ` H${x(pts[i].t).toFixed(1)} V${y(pts[i].v).toFixed(1)}`;
  const area = `${d} V${y(0).toFixed(1)} H${x(t0).toFixed(1)} Z`;
  const color = total >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted">Profit/Loss</div>
          <div className={`num mt-1 text-3xl font-semibold ${total > 0 ? "text-up" : total < 0 ? "text-down" : ""}`}>
            {money(total, { sign: true })}
          </div>
          <div className="mt-0.5 text-sm text-muted">{r.label}</div>
        </div>
        <div className="flex rounded-lg border border-line p-0.5">
          {RANGES.map((x) => (
            <button
              key={x.k}
              onClick={() => setRange(x.k)}
              className={`num rounded-md px-2.5 py-1 text-xs ${range === x.k ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              {x.k}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-52 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="pnlarea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.25" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="#262b33" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#pnlarea)" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      {pts.length <= 2 && <p className="mt-2 text-center text-xs text-dim">No positions closed in this range.</p>}
    </div>
  );
}
