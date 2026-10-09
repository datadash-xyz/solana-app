import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { categories, markets } from "@/lib/queries";
import { cents, money } from "@/lib/format";

export default function MarketsPage({ searchParams }: PageProps<"/markets">) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Markets</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Where Solana&apos;s top prediction traders hold positions right now: how many hold each market, which side their money is on, and how that compares with the
          price.
        </p>
      </div>
      <Suspense fallback={<div className="skeleton h-[640px]" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/markets">["searchParams"] }) {
  await connection();
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const category = one(sp.category) ?? "All";
  const q = one(sp.q)?.trim() || undefined;
  const [cats, rows] = await Promise.all([categories("30d"), markets({ category, q })]);
  const href = (o: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ category, q: q ?? "", ...o })) if (v && !(k === "category" && v === "All")) p.set(k, v);
    return `/markets?${p}`;
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
      <form action="/markets" className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 focus-within:border-violet">
        {category !== "All" && <input type="hidden" name="category" value={category} />}
        <svg viewBox="0 0 20 20" className="h-4 w-4 text-dim" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="9" r="6" />
          <path d="M14 14l4 4" />
        </svg>
        <input name="q" defaultValue={q} placeholder="Search markets" className="w-full bg-transparent text-sm outline-none placeholder:text-dim" />
      </form>

      <div className="card overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Market</th>
              <th className="r">Top traders holding</th>
              <th className="r">Money held</th>
              <th>Their side (Yes / No)</th>
              <th className="r">Yes price</th>
              <th className="r">Polymarket top 1,000</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const total = m.yes_usd + m.no_usd;
              const yes = total ? (100 * m.yes_usd) / total : 0;
              return (
                <tr key={m.market_id}>
                  <td>
                    <Link href={`/markets/${m.market_id}`} className="flex max-w-[460px] items-center gap-3 hover:text-violet">
                      {m.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.image_url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="h-9 w-9 shrink-0 rounded-md bg-panel-2" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate">{m.title ?? m.market_id}</span>
                        <span className="block truncate text-xs text-muted">
                          {m.outcome}
                          {m.category && <> · {m.category}</>}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="num r font-semibold">{m.holders}</td>
                  <td className="num r">{money(total)}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="flex h-2 w-28 overflow-hidden rounded-full bg-[#2a1216]">
                        <span className="h-full bg-up" style={{ width: `${yes}%` }} />
                      </span>
                      <span className="num text-xs text-muted">{Math.round(yes)}% Yes</span>
                    </span>
                  </td>
                  <td className="num r">{cents(m.price)}</td>
                  <td className="num r">{m.pm_odds === null ? <span className="text-dim">–</span> : <span className="text-violet">{Math.round(m.pm_odds * 100)}% Yes</span>}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted">
                  No indexed trader holds a matching market right now.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-dim">
        Money held = current value of indexed top Solana traders&apos; open positions. Prices are marked at the last index. Polymarket top 1,000 = Datadash smart money
        snapshot on the same market.
      </p>
    </div>
  );
}
