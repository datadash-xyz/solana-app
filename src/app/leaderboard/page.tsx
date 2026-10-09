import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { categories, leaderboard, overview, PERIODS, type Period, type Sort } from "@/lib/queries";
import { duration, money, pct, pnlClass, short } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { WinBar } from "@/components/WinBar";

const COLS: { k: Sort | null; label: string }[] = [
  { k: "pnl", label: "PnL" },
  { k: "roi", label: "ROI" },
  { k: "win_rate", label: "Win rate" },
  { k: "positions", label: "Positions" },
  { k: "profit_factor", label: "Profit factor" },
  { k: "volume", label: "Volume" },
  { k: null, label: "Hold time" },
];

export default function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="mt-1 text-sm text-muted">Top Solana prediction traders, ranked by realized PnL. Every category has its own board.</p>
        </div>
        <Suspense fallback={<div className="skeleton h-6 w-72" />}>
          <HeaderStats />
        </Suspense>
      </div>
      <Suspense fallback={<div className="skeleton h-[640px]" />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function HeaderStats() {
  await connection();
  const o = await overview();
  return (
    <div className="flex flex-wrap gap-5 text-sm text-muted">
      <span>
        <b className="num text-text">{o.wallets.toLocaleString()}</b> Solana traders
      </span>
      <span>
        <b className="num text-text">{o.positions.toLocaleString()}</b> positions
      </span>
      <span>
        <b className="num text-text">{o.verified.toLocaleString()}</b> txs verified on Solana
      </span>
    </div>
  );
}

async function Board({ searchParams }: { searchParams: PageProps<"/leaderboard">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const category = one(sp.category) ?? "All";
  const period = (PERIODS.find((p) => p.k === one(sp.period))?.k ?? "all") as Period;
  const sort = (COLS.find((c) => c.k === one(sp.sort))?.k ?? "pnl") as Sort;
  const q = one(sp.q)?.trim() || undefined;

  const [cats, rows] = await Promise.all([categories(period), leaderboard({ category, period, sort, q })]);
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ category, period, sort, q, ...o })) if (v && !(k === "category" && v === "All")) p.set(k, v);
    return `/leaderboard?${p}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href={href({ category: "All" })} className="pill" data-active={category === "All"}>
          All categories
        </Link>
        {cats.map((c) => (
          <Link key={c.category} href={href({ category: c.category })} className="pill" data-active={category === c.category}>
            {c.category} <span className="num text-[11px] opacity-60">{c.traders}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form action="/leaderboard" className="flex min-w-[260px] flex-1 items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 focus-within:border-violet">
          {category !== "All" && <input type="hidden" name="category" value={category} />}
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="sort" value={sort} />
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-dim" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="9" r="6" />
            <path d="M14 14l4 4" />
          </svg>
          <input name="q" defaultValue={q} placeholder="Search by wallet address" spellCheck={false} className="num w-full bg-transparent text-sm outline-none placeholder:text-dim" />
        </form>
        <div className="flex rounded-lg border border-line p-0.5">
          {PERIODS.map((p) => (
            <Link key={p.k} href={href({ period: p.k })} className={`num rounded-md px-2.5 py-1 text-xs ${period === p.k ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}>
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Trader</th>
              {COLS.map((c) => (
                <th key={c.label} className="r">
                  {c.k ? (
                    <Link href={href({ sort: c.k })} className={sort === c.k ? "text-text" : "hover:text-text"}>
                      {c.label}
                      {sort === c.k && " ↓"}
                    </Link>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.owner}>
                <td>
                  <Link href={`/wallet/${r.owner}`} className="flex items-center gap-3 hover:text-violet">
                    <Avatar addr={r.owner} rank={i + 1} />
                    <span>
                      <span className="num block text-sm">{short(r.owner, 5)}</span>
                      <span className="num block text-xs text-dim">#{i + 1}</span>
                    </span>
                  </Link>
                </td>
                <td className={`num r font-semibold ${pnlClass(r.pnl)}`}>{money(r.pnl, { sign: true })}</td>
                <td className={`num r ${pnlClass(r.roi)}`}>{pct(r.roi, true)}</td>
                <td className="r">
                  <WinBar pct={r.win_rate} />
                </td>
                <td className="num r">{r.positions.toLocaleString()}</td>
                <td className="r">
                  {r.profit_factor === null ? (
                    <span className="text-dim">–</span>
                  ) : (
                    <span className={`num rounded-md px-2 py-0.5 text-xs ${r.profit_factor >= 1 ? "bg-[#0f2a20] text-up" : "bg-[#2a1216] text-down"}`}>
                      {r.profit_factor >= 100 ? "100" : r.profit_factor.toFixed(2)}
                    </span>
                  )}
                </td>
                <td className="num r">{money(r.volume)}</td>
                <td className="num r text-muted">{duration(r.hold_s)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted">
                  {q ? "No trader matches that address." : "No closed positions in this category and period yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-dim">
        PnL, ROI, win rate and profit factor use positions closed in the period. ROI, win rate and profit factor rankings need 5+ positions. Volume = USDC spent on
        buys.
      </p>
    </div>
  );
}
