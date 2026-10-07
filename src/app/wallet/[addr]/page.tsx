import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { walletExists, walletSummary } from "@/lib/queries";
import { indexWallet } from "@/lib/wallet";
import { ago, cents, isSolanaAddress, money, pnlClass, short } from "@/lib/format";
import { PnlChart } from "@/components/PnlChart";
import { VerifyBadge } from "@/components/VerifyBadge";

export default function WalletPage({ params }: PageProps<"/wallet/[addr]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Wallet params={params} />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Reading this wallet from Jupiter and Solana…</p>
      <div className="skeleton h-24" />
      <div className="skeleton h-56" />
      <div className="skeleton h-80" />
    </div>
  );
}

const ACTION: Record<string, string> = { payout_claimed: "Payout", position_lost: "Lost" };

async function Wallet({ params }: { params: PageProps<"/wallet/[addr]">["params"] }) {
  await connection();
  const { addr } = await params;
  if (!isSolanaAddress(addr)) notFound();

  // Wallets outside our indexed set are fetched on first visit.
  if (!(await walletExists(addr))) {
    try {
      await indexWallet(addr);
    } catch {
      notFound();
    }
  }
  const { profile, byCategory, positions, history, pnlSeries } = await walletSummary(addr);
  if (!profile) notFound();

  const resolved = Number(profile.correct) + Number(profile.wrong);
  const winRate = resolved ? Math.round((1000 * Number(profile.correct)) / resolved) / 10 : null;
  const verified = history.filter((h) => h.verified_ok).length;
  const maxAbs = Math.max(1, ...byCategory.map((c) => Math.abs(Number(c.pnl))));

  const stats = [
    { k: "Realized PnL", v: money(profile.realized_pnl_usd, { sign: true }), c: pnlClass(profile.realized_pnl_usd) },
    { k: "Volume", v: money(profile.volume_usd) },
    { k: "Win rate", v: winRate === null ? "–" : `${winRate}%`, sub: `${profile.correct}W · ${profile.wrong}L` },
    { k: "Open positions", v: money(profile.positions_value_usd), sub: `${positions.length} held` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <p className="label">Solana wallet</p>
          <h1 className="num mt-2 break-all text-xl font-semibold sm:text-2xl">{addr}</h1>
        </div>
        <div className="flex gap-2">
          <a href={`https://solscan.io/account/${addr}`} target="_blank" rel="noreferrer" className="pill">
            Solscan ↗
          </a>
          <Link href="/leaderboard" className="pill">
            ← Leaderboard
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="card p-5">
            <div className="text-sm text-muted">{s.k}</div>
            <div className={`num mt-1 text-2xl font-semibold ${s.c ?? ""}`}>{s.v}</div>
            {s.sub && <div className="num mt-1 text-xs text-dim">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">PnL over time</h2>
            <span className="label">Cumulative realized</span>
          </div>
          <PnlChart series={pnlSeries as unknown as { day: Date; pnl: number }[]} />
        </div>
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Where they win</h2>
            <span className="label">PnL by category</span>
          </div>
          <div className="space-y-3">
            {byCategory.map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-sm">
                  <span>{c.category}</span>
                  <span className={`num ${pnlClass(c.pnl)}`}>{money(c.pnl, { sign: true })}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-panel-2">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${(100 * Math.abs(Number(c.pnl))) / maxAbs}%`, background: Number(c.pnl) >= 0 ? "var(--green)" : "var(--red)" }}
                  />
                </div>
                <div className="num mt-1 text-xs text-dim">
                  {c.markets} markets · {money(c.volume)} vol · {c.wins}W {c.losses}L
                </div>
              </div>
            ))}
            {!byCategory.length && <p className="text-sm text-dim">No trade history yet.</p>}
          </div>
        </div>
      </div>

      <section className="card overflow-x-auto">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-semibold">Open positions</h2>
          <span className="label">{positions.length} held</span>
        </div>
        <table className="tbl mt-3">
          <thead>
            <tr>
              <th>Market</th>
              <th>Side</th>
              <th className="r">Contracts</th>
              <th className="r">Avg</th>
              <th className="r">Now</th>
              <th className="r">Value</th>
              <th className="r">Unrealized</th>
              <th>Position account</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.pubkey}>
                <td className="max-w-[340px] truncate">
                  {p.event_title}
                  {p.market_title && p.market_title !== p.event_title && <span className="text-muted"> · {p.market_title}</span>}
                </td>
                <td>
                  <span className={`num text-xs font-semibold ${p.is_yes ? "text-up" : "text-down"}`}>{p.is_yes ? "YES" : "NO"}</span>
                </td>
                <td className="num r">{Number(p.contracts).toLocaleString()}</td>
                <td className="num r">{cents(p.avg_price)}</td>
                <td className="num r">{cents(p.mark_price)}</td>
                <td className="num r">{money(p.value_usd)}</td>
                <td className={`num r ${pnlClass(p.pnl_usd)}`}>{money(p.pnl_usd, { sign: true })}</td>
                <td>
                  <a className="num text-xs text-violet hover:underline" href={`https://solscan.io/account/${p.pubkey}`} target="_blank" rel="noreferrer">
                    {short(p.pubkey)} ↗
                  </a>
                </td>
              </tr>
            ))}
            {!positions.length && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted">
                  No open positions right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
          <h2 className="font-semibold">Activity</h2>
          <span className="label">
            {verified} of {history.length} verified on Solana
          </span>
        </div>
        <table className="tbl mt-3">
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Market</th>
              <th className="r">Contracts</th>
              <th className="r">Price</th>
              <th className="r">Amount</th>
              <th className="r">PnL</th>
              <th>On-chain</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => {
              const action = ACTION[h.event_type] ?? (h.is_buy ? "Buy" : "Sell");
              const amount = h.event_type === "payout_claimed" ? h.payout_usd : h.total_cost_usd;
              return (
                <tr key={h.id}>
                  <td className="num text-muted">{ago(h.ts)}</td>
                  <td>
                    <span className="font-medium">{action}</span>{" "}
                    {h.event_type === "order_filled" && (
                      <span className={`num text-xs font-semibold ${h.is_yes ? "text-up" : "text-down"}`}>{h.is_yes ? "YES" : "NO"}</span>
                    )}
                  </td>
                  <td className="max-w-[320px] truncate">
                    {h.title}
                    {h.market_title && h.market_title !== h.title && <span className="text-muted"> · {h.market_title}</span>}
                  </td>
                  <td className="num r">{Number(h.contracts) ? Number(h.contracts).toLocaleString() : "–"}</td>
                  <td className="num r">{Number(h.avg_fill_price) ? cents(h.avg_fill_price) : "–"}</td>
                  <td className="num r">{Number(amount) ? money(amount) : "–"}</td>
                  <td className={`num r ${pnlClass(h.realized_pnl_usd)}`}>{h.realized_pnl_usd === null ? "–" : money(h.realized_pnl_usd, { sign: true })}</td>
                  <td>{h.signature && <VerifyBadge signature={h.signature} verified={h.verified_ok} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {history.length === 200 && <p className="px-5 py-3 text-xs text-dim">Showing the latest 200 trades.</p>}
      </section>
    </div>
  );
}
