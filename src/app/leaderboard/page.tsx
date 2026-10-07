import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { categories, categoryLeaderboard, type Period, type Sort } from "@/lib/queries";
import { ago, money, pnlClass, short } from "@/lib/format";

const PERIODS: { k: Period; label: string }[] = [
  { k: "7d", label: "1W" },
  { k: "30d", label: "1M" },
  { k: "all", label: "ALL" },
];
const SORTS: { k: Sort; label: string }[] = [
  { k: "pnl", label: "PnL" },
  { k: "volume", label: "Volume" },
  { k: "win_rate", label: "Win rate" },
];

export default function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Solana leaderboard <span className="text-violet">by category</span>
        </h1>
        <p className="mt-2 text-muted">Realized PnL from each trader&apos;s Jupiter prediction history. Every trade links to its Solana transaction.</p>
      </div>
      <Suspense fallback={<div className="skeleton h-[520px]" />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Board({ searchParams }: { searchParams: PageProps<"/leaderboard">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const category = one(sp.category) ?? "All";
  const period = (PERIODS.find((p) => p.k === one(sp.period))?.k ?? "all") as Period;
  const sort = (SORTS.find((s) => s.k === one(sp.sort))?.k ?? "pnl") as Sort;

  const [cats, rows] = await Promise.all([categories(period), categoryLeaderboard(category, period, sort, 100)]);
  const href = (o: Partial<{ category: string; period: Period; sort: Sort }>) => {
    const q = new URLSearchParams({ category, period, sort, ...o } as Record<string, string>);
    return `/leaderboard?${q}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Link href={href({ category: "All" })} className="pill" data-active={category === "All"}>
          All
        </Link>
        {cats.map((c) => (
          <Link key={c.category} href={href({ category: c.category })} className="pill" data-active={category === c.category}>
            {c.category} <span className="num text-[11px] opacity-60">{c.traders}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODS.map((p) => (
          <Link key={p.k} href={href({ period: p.k })} className="pill num" data-active={period === p.k}>
            {p.label}
          </Link>
        ))}
        <span className="mx-2 h-5 w-px bg-line" />
        <span className="text-xs text-dim">Rank by</span>
        {SORTS.map((s) => (
          <Link key={s.k} href={href({ sort: s.k })} className="pill" data-active={sort === s.k}>
            {s.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="w-12">#</th>
              <th>Trader</th>
              <th className="r">Realized PnL</th>
              <th className="r">Volume</th>
              <th className="r">Win rate</th>
              <th className="r">Markets</th>
              <th className="r">Last trade</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.owner}>
                <td className={`num ${i < 3 ? "font-bold text-violet" : "text-muted"}`}>{i + 1}</td>
                <td>
                  <Link href={`/wallet/${r.owner}`} className="num hover:text-violet">
                    {short(r.owner, 6)}
                  </Link>
                </td>
                <td className={`num r font-semibold ${pnlClass(r.pnl)}`}>{money(r.pnl, { sign: true })}</td>
                <td className="num r">{money(r.volume)}</td>
                <td className="num r">{r.win_rate === null ? <span className="text-dim">–</span> : `${r.win_rate}%`}</td>
                <td className="num r">{r.markets}</td>
                <td className="num r text-muted">{ago(r.last_trade)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted">
                  No trades in this category for this period yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-dim">Win rate shown after 5+ resolved positions. Volume = USDC spent on filled buys.</p>
    </div>
  );
}
