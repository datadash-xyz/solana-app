import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { categories, leaderboard, overview } from "@/lib/queries";
import { money, pnlClass, short } from "@/lib/format";
import { Avatar } from "@/components/Avatar";

export default function Home() {
  return (
    <div className="space-y-14">
      <section className="relative pt-10 text-center">
        <div className="pointer-events-none absolute left-1/2 top-[-140px] -z-10 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(118,83,246,0.28),transparent)]" />
        <p className="label">Datadash · Solana prediction markets</p>
        <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          The intelligence layer for prediction markets, <span className="text-violet">now on Solana.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">
          Find the best Solana traders in every category, open their full portfolio, follow their trades live, and check every one of them on-chain.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/leaderboard" className="rounded-xl bg-violet-strong px-6 py-3 text-sm font-semibold text-white hover:opacity-90">
            Open the leaderboard
          </Link>
          <Link href="/activity" className="rounded-xl border border-line bg-panel px-6 py-3 text-sm font-semibold hover:border-muted">
            Watch live trades
          </Link>
        </div>
      </section>

      <Suspense fallback={<div className="skeleton h-28" />}>
        <Stats />
      </Suspense>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { href: "/leaderboard", t: "Leaderboards by category", d: "PnL, ROI, win rate, profit factor and hold time for every Solana trader, per category and period." },
          { href: "/activity", t: "Live trades", d: "Every Jupiter prediction trade as it lands, with the trader's track record beside it." },
          { href: "/markets", t: "Where top traders hold", d: "How many top Solana traders hold each market, which side their money is on, and the price." },
        ].map((f) => (
          <Link key={f.href} href={f.href} className="card block p-6 hover:border-violet">
            <div className="text-lg font-semibold">{f.t}</div>
            <p className="mt-2 text-sm text-muted">{f.d}</p>
            <span className="mt-4 inline-block text-sm text-violet">Open →</span>
          </Link>
        ))}
      </section>

      <Suspense fallback={<div className="skeleton h-64" />}>
        <CategoryGrid />
      </Suspense>

      <section className="card flex flex-wrap items-center gap-6 p-6">
        <div className="flex-1">
          <div className="text-lg font-semibold">Every trade, checked on Solana</div>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Each fill and payout links to its Solana transaction. We confirm them through Solana RPC (Helius), and you can re-check any trade live from a trader&apos;s
            page.
          </p>
        </div>
        <Link href="/wallet" className="rounded-xl border border-line px-5 py-2.5 text-sm font-semibold hover:border-muted">
          Look up a wallet
        </Link>
      </section>
    </div>
  );
}

async function Stats() {
  await connection();
  const o = await overview();
  const items = [
    { k: "Jupiter all-time volume", v: money(o.summary.all_time?.volume_usd) },
    { k: "Solana traders indexed", v: o.wallets.toLocaleString() },
    { k: "Positions analysed", v: o.positions.toLocaleString() },
    { k: "Transactions verified on Solana", v: o.verified.toLocaleString() },
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
  const cats = (await categories("all")).filter((c) => c.category !== "Other").slice(0, 8);
  const tops = await Promise.all(cats.map((c) => leaderboard({ category: c.category, limit: 1 })));
  const cards = cats.map((c, i) => ({ ...c, top: tops[i][0] })).filter((c) => c.top && c.top.pnl > 0);
  return (
    <section>
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Every category has its own #1</h2>
        <Link href="/leaderboard" className="text-sm text-violet hover:underline">
          All categories →
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.category} href={`/leaderboard?category=${encodeURIComponent(c.category)}`} className="card block p-5 hover:border-violet">
            <div className="text-lg font-semibold">{c.category}</div>
            <div className="label mt-1">{c.traders.toLocaleString()} traders</div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-violet bg-violet-bg px-3 py-2">
              <Avatar addr={c.top.owner} size={22} rank={1} />
              <span className="num flex-1 truncate text-sm">{short(c.top.owner)}</span>
              <span className={`num text-sm font-semibold ${pnlClass(c.top.pnl)}`}>{money(c.top.pnl, { sign: true })}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
