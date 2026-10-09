import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { activity, activityStats, categories } from "@/lib/queries";
import { ago, cents, money, pnlClass, short } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { LiveRefresh } from "@/components/LiveRefresh";

const SIZES = [
  { k: "0", label: "All sizes" },
  { k: "100", label: "$100+" },
  { k: "1000", label: "$1K+" },
  { k: "10000", label: "$10K+" },
];

export default function ActivityPage({ searchParams }: PageProps<"/activity">) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted">Every trade on Jupiter&apos;s prediction markets as it happens, with the trader&apos;s track record next to it.</p>
        </div>
        <div className="flex items-center gap-4">
          <Suspense fallback={<div className="skeleton h-6 w-64" />}>
            <Stats />
          </Suspense>
          <LiveRefresh />
        </div>
      </div>
      <Suspense fallback={<div className="skeleton h-[640px]" />}>
        <Feed searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Stats() {
  await connection();
  const s = await activityStats();
  return (
    <div className="flex flex-wrap gap-5 text-sm text-muted">
      <span>
        <b className="num text-text">{s.trades_24h.toLocaleString()}</b> trades 24h
      </span>
      <span>
        <b className="num text-text">{money(s.volume_24h)}</b> volume 24h
      </span>
      <span>
        <b className="num text-text">{s.traders_24h.toLocaleString()}</b> traders 24h
      </span>
    </div>
  );
}

async function Feed({ searchParams }: { searchParams: PageProps<"/activity">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const category = one(sp.category) ?? "All";
  const min = SIZES.find((s) => s.k === one(sp.min))?.k ?? "0";
  const top = one(sp.top) === "1";
  const [cats, rows] = await Promise.all([categories("7d"), activity({ category, min: Number(min), top })]);
  const href = (o: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ category, min, top: top ? "1" : "", ...o })) if (v && v !== "0" && !(k === "category" && v === "All")) p.set(k, v);
    return `/activity?${p}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link href={href({ category: "All" })} className="pill" data-active={category === "All"}>
          All categories
        </Link>
        {cats.map((c) => (
          <Link key={c.category} href={href({ category: c.category })} className="pill" data-active={category === c.category}>
            {c.category}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SIZES.map((s) => (
          <Link key={s.k} href={href({ min: s.k })} className="pill num" data-active={min === s.k}>
            {s.label}
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        <Link href={href({ top: top ? "" : "1" })} className="pill" data-active={top}>
          Profitable traders only
        </Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Trader</th>
              <th>Action</th>
              <th>Market</th>
              <th className="r">Price</th>
              <th className="r">Amount</th>
              <th className="r">Trader PnL</th>
              <th className="r">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link href={`/wallet/${t.owner}`} className="flex items-center gap-2.5 hover:text-violet">
                    <Avatar addr={t.owner} size={28} />
                    <span className="num text-sm">{short(t.owner, 4)}</span>
                  </Link>
                </td>
                <td>
                  <span className="font-medium capitalize">{t.action}</span>{" "}
                  <span className={`num rounded px-1.5 py-0.5 text-[11px] font-semibold ${t.side === "yes" ? "bg-[#0f2a20] text-up" : "bg-[#2a1216] text-down"}`}>
                    {t.side.toUpperCase()}
                  </span>
                </td>
                <td>
                  <span className="flex max-w-[420px] items-center gap-3">
                    {t.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image_url} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
                    ) : (
                      <span className="h-8 w-8 shrink-0 rounded-md bg-panel-2" />
                    )}
                    <span className="min-w-0">
                      <Link href={`/markets/${t.market_id}`} className="block truncate hover:text-violet">
                        {t.event_title}
                      </Link>
                      <span className="block truncate text-xs text-muted">
                        {t.market_title}
                        {t.category && <> · {t.category}</>}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="num r">{cents(t.price)}</td>
                <td className={`num r font-semibold ${t.amount_usd >= 1000 ? "text-violet" : ""}`}>{money(t.amount_usd)}</td>
                <td className={`num r ${pnlClass(t.trader_pnl)}`}>{t.trader_pnl === null ? <span className="text-dim">new</span> : money(t.trader_pnl, { sign: true })}</td>
                <td className="num r text-muted">{ago(t.ts)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted">
                  No trades match these filters yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-dim">Trader PnL = realized PnL across their indexed Solana history. &ldquo;new&rdquo; = not indexed yet; open their page to load it.</p>
    </div>
  );
}
