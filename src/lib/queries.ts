// Read queries behind the web pages and the MCP tools.
import { sql } from "./db";

export type Period = "7d" | "30d" | "all";
export type Sort = "pnl" | "volume" | "win_rate";

const since = (p: Period) => (p === "7d" ? new Date(Date.now() - 7 * 864e5) : p === "30d" ? new Date(Date.now() - 30 * 864e5) : new Date(0));

// Per-wallet, per-category stats built from on-chain-backed history.
// Category comes from the event; history rows without an event fall back to the market's event.
const statsCte = (from: Date) => sql`
  with h as (
    select h.*, coalesce(e.category, e2.category, 'Other') as category
    from history h
    left join events e on e.event_id = h.event_id
    left join markets m on m.market_id = h.market_id
    left join events e2 on e2.event_id = m.event_id
    where h.ts >= ${from}
  ),
  s as (
    select owner, category,
      coalesce(sum(realized_pnl_usd), 0)::float8 as pnl,
      coalesce(sum(total_cost_usd) filter (where event_type = 'order_filled' and is_buy), 0)::float8 as volume,
      count(distinct position_pubkey) filter (where event_type = 'payout_claimed')::int as wins,
      count(distinct position_pubkey) filter (where event_type = 'position_lost')::int as losses,
      count(distinct market_id) filter (where event_type = 'order_filled')::int as markets,
      max(ts) as last_trade
    from h group by owner, category
  )`;

export async function categories(period: Period = "all") {
  return sql<{ category: string; traders: number; volume: number; pnl_top: number }[]>`
    ${statsCte(since(period))}
    select category, count(*)::int as traders, sum(volume)::float8 as volume, max(pnl)::float8 as pnl_top
    from s where volume > 0 or pnl <> 0
    group by category order by (category = 'Other'), volume desc`;
}

export async function categoryLeaderboard(category: string | "All", period: Period = "all", sort: Sort = "pnl", limit = 100) {
  const order = sort === "volume" ? sql`volume desc` : sort === "win_rate" ? sql`win_rate desc nulls last, pnl desc` : sql`pnl desc`;
  return sql<{ owner: string; pnl: number; volume: number; wins: number; losses: number; win_rate: number | null; markets: number; last_trade: Date }[]>`
    ${statsCte(since(period))},
    t as (
      select owner, sum(pnl)::float8 pnl, sum(volume)::float8 volume, sum(wins)::int wins, sum(losses)::int losses,
        sum(markets)::int markets, max(last_trade) last_trade
      from s where ${category === "All" ? sql`true` : sql`category = ${category}`}
      group by owner
    )
    select *, case when wins + losses >= 5 then round(100.0 * wins / (wins + losses), 1)::float8 end as win_rate
    from t where volume > 0 or pnl <> 0
    order by ${order} limit ${limit}`;
}

export async function walletSummary(owner: string) {
  const [profile] = await sql`select * from profiles where owner = ${owner}`;
  const byCategory = await sql`${statsCte(new Date(0))}
    select category, pnl, volume, wins, losses, markets from s where owner = ${owner} order by pnl desc`;
  const positions = await sql`select p.*, coalesce(e.title, m.title) as event_title, m.title as market_title, e.category
    from positions p left join markets m on m.market_id = p.market_id left join events e on e.event_id = coalesce(p.event_id, m.event_id)
    where p.owner = ${owner} order by p.cost_usd desc nulls last`;
  const history = await sql`select h.id, h.event_type, h.signature, h.ts, h.market_id, h.is_buy, h.is_yes, h.contracts,
      h.avg_fill_price, h.total_cost_usd, h.realized_pnl_usd, h.payout_usd, h.title, h.verified_ok, m.title as market_title
    from history h left join markets m on m.market_id = h.market_id
    where h.owner = ${owner} and h.event_type in ('order_filled', 'payout_claimed', 'position_lost')
    order by h.ts desc limit 200`;
  const pnlSeries = await sql`select date_trunc('day', ts) as day, sum(realized_pnl_usd)::float8 as pnl
    from history where owner = ${owner} and realized_pnl_usd is not null group by 1 order by 1`;
  const [w] = await sql`select history_at from wallets where owner = ${owner}`;
  return { profile, byCategory, positions, history, pnlSeries, complete: !!w?.history_at };
}

export async function overview() {
  const summary = await sql<{ period: string; volume_usd: number; predictions: number }[]>`
    select period, volume_usd::float8, predictions::int from platform_summary`;
  const [counts] = await sql<{ wallets: number; trades: number; verified: number; events: number }[]>`
    select (select count(*) from profiles)::int as wallets,
      (select count(*) from history where event_type = 'order_filled')::int as trades,
      (select count(*) from history where verified_ok)::int as verified,
      (select count(*) from events)::int as events`;
  return { summary: Object.fromEntries(summary.map((s) => [s.period, s])), ...counts };
}

export async function walletExists(owner: string) {
  const [r] = await sql`select 1 from profiles where owner = ${owner}`;
  return !!r;
}
