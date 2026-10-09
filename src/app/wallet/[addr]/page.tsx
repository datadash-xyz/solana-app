import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { walletExists, walletSummary } from "@/lib/queries";
import { indexWallet } from "@/lib/wallet";
import { ago, cents, duration, isSolanaAddress, money, pct, pnlClass, short } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { Gauge } from "@/components/Gauge";
import { PnlPanel } from "@/components/PnlPanel";
import { VerifyBadge } from "@/components/VerifyBadge";

type Tab = "portfolio" | "activity" | "category";

export default function WalletPage({ params, searchParams }: PageProps<"/wallet/[addr]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Wallet params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Reading this wallet from Jupiter and Solana…</p>
      <div className="skeleton h-20" />
      <div className="skeleton h-80" />
      <div className="skeleton h-96" />
    </div>
  );
}

const ACTION: Record<string, string> = { payout_claimed: "Payout", position_lost: "Lost" };

async function Wallet({ params, searchParams }: { params: PageProps<"/wallet/[addr]">["params"]; searchParams: PageProps<"/wallet/[addr]">["searchParams"] }) {
  await connection();
  const { addr } = await params;
  const sp = await searchParams;
  const tab = (["portfolio", "activity", "category"].includes(String(sp.tab)) ? sp.tab : "portfolio") as Tab;
  const posView = sp.pos === "closed" ? "closed" : "active";
  if (!isSolanaAddress(addr)) notFound();

  // Wallets outside our indexed set are fetched on first visit.
  if (!(await walletExists(addr))) {
    try {
      await indexWallet(addr, { quick: true });
    } catch {
      notFound();
    }
  }
  const w = await walletSummary(addr);
  if (!w.profile) notFound();
  const { profile, stats, rank, byCategory, open, closed, history, series, complete } = w;

  const resolved = stats.wins + stats.losses;
  const winRate = resolved ? (100 * stats.wins) / resolved : null;
  const pf = stats.gross_loss > 0 ? stats.gross_win / stats.gross_loss : stats.gross_win > 0 ? 100 : null;
  let peak = 0, run = 0, maxDd = 0;
  for (const s of series) {
    run += s.pnl;
    peak = Math.max(peak, run);
    maxDd = Math.max(maxDd, peak - run);
  }
  const verified = history.filter((h) => h.verified_ok).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar addr={addr} size={56} rank={rank.rank} />
        <div className="min-w-0 flex-1">
          <h1 className="num truncate text-xl font-semibold" title={addr}>
            {short(addr, 6)}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            <span className="num text-text">#{rank.rank}</span> of {rank.total.toLocaleString()} Solana traders by realized PnL
            {stats.first_trade && <> · trading since {new Date(stats.first_trade).toISOString().slice(0, 10)}</>}
          </p>
        </div>
        <a href={`https://solscan.io/account/${addr}`} target="_blank" rel="noreferrer" className="pill">
          Solscan ↗
        </a>
      </div>

      {!complete && (
        <p className="rounded-xl border border-violet bg-violet-bg px-4 py-3 text-sm text-violet">
          Showing this wallet&apos;s recent trades. Its full history is being indexed. Headline totals come from Jupiter.
        </p>
      )}

      <div className="flex gap-1 border-b border-line">
        {(["portfolio", "activity", "category"] as Tab[]).map((t) => (
          <Link
            key={t}
            href={`/wallet/${addr}?tab=${t}`}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm capitalize ${tab === t ? "border-violet text-text" : "border-transparent text-muted hover:text-text"}`}
          >
            {t}
          </Link>
        ))}
      </div>

      {tab === "portfolio" && (
        <>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="card p-5 lg:col-span-2">
              <PnlPanel series={series.map((s) => ({ t: new Date(s.t).toISOString(), pnl: s.pnl }))} />
            </div>
            <div className="card divide-y divide-line">
              <div className="p-5">
                <div className="text-sm text-muted">Portfolio value</div>
                <div className="num mt-1 text-3xl font-semibold">{money(profile.positions_value_usd)}</div>
                <div className="num mt-1 text-xs text-dim">{open.length} open positions</div>
              </div>
              <div className="grid grid-cols-2 gap-4 p-5">
                <Stat k="Volume" v={money(profile.volume_usd)} />
                <Stat k="Win rate" v={pct(winRate)} extra={<Gauge value={winRate === null ? null : winRate / 100} />} sub={`${stats.wins}W · ${stats.losses}L`} />
                <Stat k="Avg PnL / position" v={money(resolved ? stats.pnl / resolved : null, { sign: true })} cls={pnlClass(stats.pnl)} />
                <Stat k="Profit factor" v={pf === null ? "–" : pf >= 100 ? "100" : pf.toFixed(2)} extra={<Gauge value={pf === null ? null : pf / (1 + pf)} />} />
              </div>
              <div className="space-y-2.5 p-5 text-sm">
                <Row k="Avg trades / position" v={(stats.fills / Math.max(1, stats.positions + open.length)).toFixed(2)} />
                <Row k="Avg position size" v={money(stats.avg_size)} />
                <Row k="Avg holding time" v={duration(stats.hold_s)} />
                <Row k="Max drawdown" v={money(maxDd)} />
              </div>
            </div>
          </div>

          <section className="card overflow-x-auto">
            <div className="flex items-center justify-between px-5 pt-4">
              <div className="flex rounded-lg border border-line p-0.5">
                {(["active", "closed"] as const).map((v) => (
                  <Link
                    key={v}
                    href={`/wallet/${addr}?tab=portfolio${v === "closed" ? "&pos=closed" : ""}`}
                    className={`rounded-md px-3 py-1 text-xs capitalize ${posView === v ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
                  >
                    {v} <span className="num opacity-60">{v === "active" ? open.length : stats.positions}</span>
                  </Link>
                ))}
              </div>
              <span className="label">{posView === "active" ? "Marked at last index" : "Rebuilt from on-chain history"}</span>
            </div>
            {posView === "active" ? <OpenTable rows={open} /> : <ClosedTable rows={closed} />}
          </section>
        </>
      )}

      {tab === "activity" && (
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
                      <span className="font-medium">{action}</span> {h.event_type === "order_filled" && <Side yes={h.is_yes} />}
                    </td>
                    <td className="max-w-[340px] truncate">
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
      )}

      {tab === "category" && <CategoryTab rows={byCategory} />}
    </div>
  );
}

function Stat({ k, v, sub, extra, cls }: { k: string; v: string; sub?: string; extra?: ReactNode; cls?: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{k}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className={`num text-lg font-semibold ${cls ?? ""}`}>{v}</span>
        {extra}
      </div>
      {sub && <div className="num text-[11px] text-dim">{sub}</div>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}

function Side({ yes }: { yes: boolean | null }) {
  return <span className={`num rounded px-1.5 py-0.5 text-[11px] font-semibold ${yes ? "bg-[#0f2a20] text-up" : "bg-[#2a1216] text-down"}`}>{yes ? "YES" : "NO"}</span>;
}

function MarketCell({ title, outcome, image }: { title: string | null; outcome?: string | null; image?: string | null }) {
  return (
    <span className="flex max-w-[380px] items-center gap-3">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="h-8 w-8 shrink-0 rounded-md bg-panel-2" />
      )}
      <span className="min-w-0">
        <span className="block truncate">{title}</span>
        {outcome && outcome !== title && <span className="block truncate text-xs text-muted">{outcome}</span>}
      </span>
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OpenTable({ rows }: { rows: any[] }) {
  return (
    <table className="tbl mt-3">
      <thead>
        <tr>
          <th>Prediction</th>
          <th>Side</th>
          <th className="r">Contracts</th>
          <th className="r">Avg</th>
          <th className="r">Now</th>
          <th className="r">Value</th>
          <th className="r">Open PnL</th>
          <th className="r">ROI</th>
          <th>Account</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const roi = Number(p.cost_usd) > 0 && p.pnl_usd !== null ? (100 * Number(p.pnl_usd)) / Number(p.cost_usd) : null;
          return (
            <tr key={p.pubkey}>
              <td>
                <MarketCell title={p.event_title} outcome={p.market_title} image={p.image_url} />
              </td>
              <td>
                <Side yes={p.is_yes} />
              </td>
              <td className="num r">{Number(p.contracts).toLocaleString()}</td>
              <td className="num r">{cents(p.avg_price)}</td>
              <td className="num r">{cents(p.mark_price)}</td>
              <td className="num r">{money(p.value_usd)}</td>
              <td className={`num r ${pnlClass(p.pnl_usd)}`}>{money(p.pnl_usd, { sign: true })}</td>
              <td className={`num r ${pnlClass(roi)}`}>{pct(roi, true)}</td>
              <td>
                <a className="num text-xs text-violet hover:underline" href={`https://solscan.io/account/${p.pubkey}`} target="_blank" rel="noreferrer">
                  {short(p.pubkey)} ↗
                </a>
              </td>
            </tr>
          );
        })}
        {!rows.length && (
          <tr>
            <td colSpan={9} className="py-10 text-center text-muted">
              No open positions right now.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ClosedTable({ rows }: { rows: any[] }) {
  return (
    <table className="tbl mt-3">
      <thead>
        <tr>
          <th>Prediction</th>
          <th>Side</th>
          <th>Result</th>
          <th className="r">Cost</th>
          <th className="r">PnL</th>
          <th className="r">ROI</th>
          <th className="r">Held</th>
          <th className="r">Closed</th>
          <th>On-chain</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const result = p.won ? "Won" : p.lost ? "Lost" : "Sold";
          const roi = p.cost_usd > 0 ? (100 * p.realized_pnl) / p.cost_usd : null;
          const held = p.opened_at && p.closed_at ? (new Date(p.closed_at).getTime() - new Date(p.opened_at).getTime()) / 1000 : null;
          return (
            <tr key={p.position_pubkey}>
              <td>
                <MarketCell title={p.title} outcome={p.market_title} image={p.image_url} />
              </td>
              <td>{p.is_yes !== null && <Side yes={p.is_yes} />}</td>
              <td>
                <span className={`rounded-md px-2 py-0.5 text-xs ${result === "Won" ? "bg-[#0f2a20] text-up" : result === "Lost" ? "bg-[#2a1216] text-down" : "bg-panel-2 text-muted"}`}>
                  {result}
                </span>
              </td>
              <td className="num r">{money(p.cost_usd)}</td>
              <td className={`num r font-semibold ${pnlClass(p.realized_pnl)}`}>{money(p.realized_pnl, { sign: true })}</td>
              <td className={`num r ${pnlClass(roi)}`}>{pct(roi, true)}</td>
              <td className="num r text-muted">{duration(held)}</td>
              <td className="num r text-muted">{ago(p.closed_at)}</td>
              <td>{p.last_signature && <VerifyBadge signature={p.last_signature} verified={p.verified} />}</td>
            </tr>
          );
        })}
        {!rows.length && (
          <tr>
            <td colSpan={9} className="py-10 text-center text-muted">
              No closed positions yet.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function CategoryTab({ rows }: { rows: { category: string; pnl: number; volume: number; wins: number; losses: number; positions: number }[] }) {
  const maxAbs = Math.max(1, ...rows.map((c) => Math.abs(c.pnl)));
  return (
    <div className="grid gap-3 lg:grid-cols-5">
      <div className="card p-5 lg:col-span-2">
        <h2 className="font-semibold">Where they win</h2>
        <p className="text-sm text-muted">Realized PnL by category</p>
        <div className="mt-5 space-y-4">
          {rows.map((c) => (
            <div key={c.category}>
              <div className="flex justify-between text-sm">
                <span>{c.category}</span>
                <span className={`num ${pnlClass(c.pnl)}`}>{money(c.pnl, { sign: true })}</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-panel-2">
                <div className="h-2 rounded-full" style={{ width: `${(100 * Math.abs(c.pnl)) / maxAbs}%`, background: c.pnl >= 0 ? "var(--green)" : "var(--red)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card overflow-x-auto lg:col-span-3">
        <table className="tbl">
          <thead>
            <tr>
              <th>Category</th>
              <th className="r">PnL</th>
              <th className="r">Volume</th>
              <th className="r">Positions</th>
              <th className="r">Win rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.category}>
                <td>
                  <Link href={`/leaderboard?category=${encodeURIComponent(c.category)}`} className="hover:text-violet">
                    {c.category}
                  </Link>
                </td>
                <td className={`num r ${pnlClass(c.pnl)}`}>{money(c.pnl, { sign: true })}</td>
                <td className="num r">{money(c.volume)}</td>
                <td className="num r">{c.positions}</td>
                <td className="num r">{c.wins + c.losses ? pct((100 * c.wins) / (c.wins + c.losses)) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
