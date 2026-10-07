import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { categories, categoryLeaderboard, overview } from "@/lib/queries";
import { money, pnlClass, short } from "@/lib/format";

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="pt-6">
        <p className="label">Solana prediction markets · Jupiter · Kalshi · Polymarket · Forecast</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          The best Solana prediction traders, <span className="text-violet">ranked by category.</span>
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          One global leaderboard hides the specialists. Datadash ranks Solana traders in every category, opens their full portfolio, and checks every
          trade against the Solana blockchain.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/leaderboard" className="rounded-full bg-text px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90">
            Open the leaderboard
          </Link>
          <Link href="/wallet" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-muted">
            Look up a wallet
          </Link>
        </div>
      </section>

      <Suspense fallback={<div className="skeleton h-28" />}>
        <Stats />
      </Suspense>

      <Suspense fallback={<div className="skeleton h-64" />}>
        <CategoryGrid />
      </Suspense>
    </div>
  );
}

async function Stats() {
  await connection();
  const o = await overview();
  const items = [
    { k: "Jupiter all-time volume", v: money(o.summary.all_time?.volume_usd) },
    { k: "Predictions on Jupiter", v: (o.summary.all_time?.predictions ?? 0).toLocaleString() },
    { k: "Solana traders indexed", v: o.wallets.toLocaleString() },
    { k: "Trades verified on Solana", v: o.verified.toLocaleString() },
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((i) => (
        <div key={i.k} className="card p-5">
          <div className="num text-2xl font-semibold sm:text-3xl">{i.v}</div>
          <div className="mt-1 text-sm text-muted">{i.k}</div>
        </div>
      ))}
    </section>
  );
}

async function CategoryGrid() {
  await connection();
  const cats = (await categories("all")).filter((c) => c.category !== "Other" && c.pnl_top > 0).slice(0, 8);
  const tops = await Promise.all(cats.map((c) => categoryLeaderboard(c.category, "all", "pnl", 1)));
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Every category has its own #1</h2>
        <Link href="/leaderboard" className="text-sm text-violet hover:underline">
          All categories →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cats.map((c, i) => {
          const top = tops[i][0];
          return (
            <Link key={c.category} href={`/leaderboard?category=${encodeURIComponent(c.category)}`} className="card block p-5 hover:border-violet">
              <div className="text-lg font-semibold">{c.category}</div>
              <div className="label mt-1">
                {c.traders.toLocaleString()} traders · {money(c.volume)} vol
              </div>
              {top && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-violet bg-violet-bg px-3 py-2">
                  <span className="num font-bold text-violet">#1</span>
                  <span className="num flex-1 truncate text-sm">{short(top.owner)}</span>
                  <span className={`num text-sm font-semibold ${pnlClass(top.pnl)}`}>{money(top.pnl, { sign: true })}</span>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
