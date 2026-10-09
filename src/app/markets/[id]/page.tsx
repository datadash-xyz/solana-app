import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { marketDetail } from "@/lib/queries";
import { ago, cents, money, pnlClass, short } from "@/lib/format";
import { Avatar } from "@/components/Avatar";

export default function MarketPage({ params }: PageProps<"/markets/[id]">) {
  return (
    <Suspense fallback={<div className="skeleton h-[720px]" />}>
      <Market params={params} />
    </Suspense>
  );
}

async function Market({ params }: { params: PageProps<"/markets/[id]">["params"] }) {
  await connection();
  const { id } = await params;
  const { summary, meta, holders, pm, trades } = await marketDetail(decodeURIComponent(id));
  if (!summary && !meta && !trades.length) notFound();

  const title = summary?.title ?? meta?.event_title ?? trades[0]?.event_title ?? id;
  const outcome = summary?.outcome ?? meta?.title ?? trades[0]?.market_title;
  const image = summary?.image_url ?? meta?.image_url;
  const price = summary?.price ?? (meta?.buy_yes !== null && meta?.buy_yes !== undefined ? Number(meta.buy_yes) : null);
  const solOdds = summary?.smart_odds ?? null;
  const pmOdds = pm ? Number(pm.smart_odds) : null;
  const yesUsd = summary?.yes_usd ?? 0, noUsd = summary?.no_usd ?? 0;

  return (
    <div className="space-y-6">
      <Link href="/markets" className="text-sm text-muted hover:text-text">
        ← Markets
      </Link>
      <div className="flex items-center gap-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-14 w-14 rounded-xl object-cover" />
        ) : (
          <span className="h-14 w-14 rounded-xl bg-panel-2" />
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {outcome}
            {(summary?.category ?? meta?.category) && <> · {summary?.category ?? meta?.category}</>}
            {id.startsWith("POLY-") && <> · Polymarket market, traded on Solana via Jupiter</>}
          </p>
        </div>
      </div>

      <section className="card p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{pm ? "Same market, two chains" : "Top Solana traders vs the market"}</h2>
          <span className="label">Chance of Yes</span>
        </div>
        <div className={`mt-6 grid gap-3 ${pm ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          <OddsCard label="Market price" value={price} sub="Yes price on Jupiter" />
          <OddsCard
            label="Top Solana traders"
            value={solOdds}
            sub={summary ? `${summary.holders} traders · ${money(yesUsd)} Yes / ${money(noUsd)} No` : "No indexed trader holds this market"}
            accent
          />
          {pm && (
            <OddsCard
              label="Polymarket top 1,000"
              value={pmOdds}
              sub={`${pm.traders ?? "–"} traders · ${money(pm.smart_yes_usd)} Yes / ${money(pm.smart_no_usd)} No · Datadash, ${new Date(pm.snapshot_at).toISOString().slice(0, 10)}`}
              violet
            />
          )}
        </div>
        <Scale marks={[
          { v: price, label: "Market", color: "#f2f3f5" },
          { v: solOdds, label: "Solana", color: "var(--green)" },
          ...(pm ? [{ v: pmOdds, label: "Polymarket", color: "var(--violet)" }] : []),
        ]} />
        <p className="mt-4 text-xs text-dim">
          Trader odds = share of their money on Yes (dollar-weighted). Solana side counts our indexed top Jupiter traders; small samples move a lot. Not financial
          advice.
        </p>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-semibold">Top Solana traders holding</h2>
          <span className="label">{holders.length} positions</span>
        </div>
        <table className="tbl mt-3">
          <thead>
            <tr>
              <th>Trader</th>
              <th>Side</th>
              <th className="r">Contracts</th>
              <th className="r">Avg</th>
              <th className="r">Value</th>
              <th className="r">Open PnL</th>
              <th className="r">Trader PnL (all)</th>
              <th className="r">Win rate</th>
              <th>Account</th>
            </tr>
          </thead>
          <tbody>
            {holders.map((h) => (
              <tr key={h.pubkey}>
                <td>
                  <Link href={`/wallet/${h.owner}`} className="flex items-center gap-2.5 hover:text-violet">
                    <Avatar addr={h.owner} size={28} />
                    <span className="num text-sm">{short(h.owner, 5)}</span>
                  </Link>
                </td>
                <td>
                  <span className={`num rounded px-1.5 py-0.5 text-[11px] font-semibold ${h.is_yes ? "bg-[#0f2a20] text-up" : "bg-[#2a1216] text-down"}`}>
                    {h.is_yes ? "YES" : "NO"}
                  </span>
                </td>
                <td className="num r">{Number(h.contracts).toLocaleString()}</td>
                <td className="num r">{cents(h.avg_price)}</td>
                <td className="num r">{money(h.value_usd)}</td>
                <td className={`num r ${pnlClass(h.pnl_usd)}`}>{money(h.pnl_usd, { sign: true })}</td>
                <td className={`num r ${pnlClass(h.trader_pnl)}`}>{money(h.trader_pnl, { sign: true })}</td>
                <td className="num r">{h.trader_win_rate === null ? "–" : `${Number(h.trader_win_rate).toFixed(1)}%`}</td>
                <td>
                  <a className="num text-xs text-violet hover:underline" href={`https://solscan.io/account/${h.pubkey}`} target="_blank" rel="noreferrer">
                    {short(h.pubkey)} ↗
                  </a>
                </td>
              </tr>
            ))}
            {!holders.length && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted">
                  None of our indexed top traders hold this market right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {trades.length > 0 && (
        <section className="card overflow-x-auto">
          <div className="px-5 pt-5">
            <h2 className="font-semibold">Recent trades on Solana</h2>
          </div>
          <table className="tbl mt-3">
            <thead>
              <tr>
                <th>Trader</th>
                <th>Action</th>
                <th className="r">Price</th>
                <th className="r">Amount</th>
                <th className="r">Trader PnL</th>
                <th className="r">Time</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/wallet/${t.owner}`} className="flex items-center gap-2.5 hover:text-violet">
                      <Avatar addr={t.owner} size={24} />
                      <span className="num text-sm">{short(t.owner, 4)}</span>
                    </Link>
                  </td>
                  <td className="capitalize">
                    {t.action} <span className={t.side === "yes" ? "text-up" : "text-down"}>{t.side.toUpperCase()}</span>
                  </td>
                  <td className="num r">{cents(t.price)}</td>
                  <td className="num r">{money(t.amount_usd)}</td>
                  <td className={`num r ${pnlClass(t.trader_pnl)}`}>{t.trader_pnl === null ? <span className="text-dim">new</span> : money(t.trader_pnl, { sign: true })}</td>
                  <td className="num r text-muted">{ago(t.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function OddsCard({ label, value, sub, accent, violet }: { label: string; value: number | null; sub: string; accent?: boolean; violet?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${violet ? "border-violet bg-violet-bg" : accent ? "border-[#1d4d3a] bg-[#0b1a14]" : "border-line bg-panel-2"}`}>
      <div className="text-sm text-muted">{label}</div>
      <div className={`num mt-2 text-5xl font-semibold ${violet ? "text-violet" : accent ? "text-up" : ""}`}>{value === null ? "–" : `${Math.round(value * 100)}%`}</div>
      <div className="mt-2 text-xs text-dim">{sub}</div>
    </div>
  );
}

function Scale({ marks }: { marks: { v: number | null; label: string; color: string }[] }) {
  return (
    <div className="relative mt-8 h-14">
      <div className="absolute inset-x-0 top-6 h-1.5 rounded-full bg-gradient-to-r from-[#2a1216] via-[#1d2229] to-[#0f2a20]" />
      <span className="num absolute left-0 top-10 text-[11px] text-dim">0%</span>
      <span className="num absolute right-0 top-10 text-[11px] text-dim">100%</span>
      {marks.filter((m) => m.v !== null).map((m, i) => (
        <div key={m.label} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${Math.min(97, Math.max(3, (m.v as number) * 100))}%` }}>
          <div className="text-[11px] font-medium" style={{ color: m.color, transform: `translateY(${i % 2 ? 36 : 0}px)` }}>
            {m.label}
          </div>
          <div className="mx-auto mt-0.5 h-4 w-1 rounded-full" style={{ background: m.color, transform: `translateY(${i % 2 ? -16 : 0}px)` }} />
        </div>
      ))}
    </div>
  );
}
