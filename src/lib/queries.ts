// Read queries behind the web pages and the MCP tools.
// Trader metrics come from position_stats (one row per position account, rebuilt from history).
import { sql } from "./db";

export type Period = "1d" | "7d" | "30d" | "1y" | "all";
export type Sort = "pnl" | "roi" | "win_rate" | "positions" | "profit_factor" | "volume";

export const PERIODS: { k: Period; label: string }[] = [
  { k: "1d", label: "1D" },
  { k: "7d", label: "1W" },
  { k: "30d", label: "1M" },
  { k: "1y", label: "1Y" },
  { k: "all", label: "ALL" },
];
const DAYS: Record<Period, number> = { "1d": 1, "7d": 7, "30d": 30, "1y": 365, all: 0 };
export const since = (p: Period) => (DAYS[p] ? new Date(Date.now() - DAYS[p] * 864e5) : new Date(0));

// Ratio-style sorts need a minimum sample, otherwise one lucky trade tops the board.
const MIN_POSITIONS = 5;

export type LeaderRow = {
  owner: string;
  pnl: number;
  roi: number | null;
  win_rate: number | null;
  wins: number;
  losses: number;
  positions: number;
  profit_factor: number | null;
  volume: number;
  hold_s: number | null;
  last_close: Date | null;
};

export async function leaderboard(opts: { category?: string; period?: Period; sort?: Sort; q?: string; limit?: number } = {}) {
  const { category = "All", period = "all", sort = "pnl", q, limit = 100 } = opts;
  const from = since(period);
  const cat = category === "All" ? sql`true` : sql`category = ${category}`;
  const order =
    sort === "roi" ? sql`roi desc nulls last` : sort === "win_rate" ? sql`win_rate desc nulls last, pnl desc`
    : sort === "positions" ? sql`positions desc` : sort === "profit_factor" ? sql`profit_factor desc nulls last, pnl desc`
    : sort === "volume" ? sql`volume desc` : sql`pnl desc`;
  const minSample = ["roi", "win_rate", "profit_factor"].includes(sort) ? sql`positions >= ${MIN_POSITIONS}` : sql`true`;
  return sql<LeaderRow[]>`
    with c as (
      select owner, realized_pnl, cost_usd, opened_at, closed_at from position_stats
      where realized_pnl is not null and closed_at >= ${from} and ${cat}
    ),
    o as (
      select owner, sum(cost_usd)::float8 as volume from position_stats where opened_at >= ${from} and ${cat} group by owner
    ),
    a as (
      select owner, sum(realized_pnl)::float8 as pnl, sum(cost_usd)::float8 as closed_cost, count(*)::int as positions,
        count(*) filter (where realized_pnl > 0)::int as wins, count(*) filter (where realized_pnl <= 0)::int as losses,
        coalesce(sum(realized_pnl) filter (where realized_pnl > 0), 0)::float8 as gross_win,
        coalesce(-sum(realized_pnl) filter (where realized_pnl < 0), 0)::float8 as gross_loss,
        extract(epoch from avg(closed_at - opened_at))::float8 as hold_s, max(closed_at) as last_close
      from c group by owner
    ),
    r as (
      select a.owner, a.pnl, a.wins, a.losses, a.positions, a.hold_s, a.last_close, coalesce(o.volume, 0)::float8 as volume,
        case when a.closed_cost > 0 then 100 * a.pnl / a.closed_cost end::float8 as roi,
        (100.0 * a.wins / nullif(a.wins + a.losses, 0))::float8 as win_rate,
        case when a.gross_loss > 0 then least(a.gross_win / a.gross_loss, 100) when a.gross_win > 0 then 100 end::float8 as profit_factor
      from a left join o using (owner)
    )
    select * from r
    where ${minSample} and ${q ? sql`owner ilike ${q + "%"}` : sql`true`}
    order by ${order} limit ${limit}`;
}

export async function categories(period: Period = "all") {
  const from = since(period);
  return sql<{ category: string; traders: number; volume: number }[]>`
    select category, count(distinct owner)::int as traders, coalesce(sum(cost_usd) filter (where opened_at >= ${from}), 0)::float8 as volume
    from position_stats where (closed_at >= ${from} or opened_at >= ${from})
    group by category order by (category = 'Other'), traders desc`;
}

export async function overview() {
  const summary = await sql<{ period: string; volume_usd: number; predictions: number }[]>`
    select period, volume_usd::float8, predictions::int from platform_summary`;
  const [counts] = await sql<{ wallets: number; trades: number; verified: number; events: number; positions: number }[]>`
    select (select count(*) from profiles)::int as wallets,
      (select count(*) from history where event_type = 'order_filled')::int as trades,
      (select count(distinct signature) from history
        where verified_ok and event_type in ('order_filled', 'payout_claimed', 'position_lost'))::int as verified,
      (select count(distinct event_id) from position_stats)::int as events,
      (select count(*) from position_stats)::int as positions`;
  return { summary: Object.fromEntries(summary.map((s) => [s.period, s])), ...counts };
}

export async function walletExists(owner: string) {
  const [r] = await sql`select 1 from profiles where owner = ${owner}`;
  return !!r;
}

export async function walletSummary(owner: string) {
  const [[profile], [stats], [rank], byCategory, open, closed, history, series, [w]] = await Promise.all([
    sql`select * from profiles where owner = ${owner}`,
    sql<{
      positions: number; wins: number; losses: number; gross_win: number; gross_loss: number;
      hold_s: number | null; avg_size: number | null; fills: number; pnl: number; first_trade: Date | null;
    }[]>`
      select count(*) filter (where realized_pnl is not null)::int as positions,
        count(*) filter (where realized_pnl > 0)::int as wins, count(*) filter (where realized_pnl <= 0)::int as losses,
        coalesce(sum(realized_pnl) filter (where realized_pnl > 0), 0)::float8 as gross_win,
        coalesce(-sum(realized_pnl) filter (where realized_pnl < 0), 0)::float8 as gross_loss,
        extract(epoch from avg(closed_at - opened_at) filter (where realized_pnl is not null))::float8 as hold_s,
        avg(nullif(cost_usd, 0))::float8 as avg_size, coalesce(sum(fills), 0)::int as fills,
        coalesce(sum(realized_pnl), 0)::float8 as pnl, min(opened_at) as first_trade
      from position_stats_live where owner = ${owner}`,
    // All-time rank by realized PnL among indexed Solana traders.
    sql<{ rank: number; total: number }[]>`
      with t as (select owner, sum(realized_pnl) as pnl from position_stats where realized_pnl is not null group by owner)
      select (select count(*) from t where pnl > coalesce((select pnl from t where owner = ${owner}), 0))::int + 1 as rank,
        (select count(*) from t)::int as total`,
    sql<{ category: string; pnl: number; volume: number; wins: number; losses: number; positions: number }[]>`
      select category, coalesce(sum(realized_pnl), 0)::float8 as pnl, sum(cost_usd)::float8 as volume,
        count(*) filter (where realized_pnl > 0)::int as wins, count(*) filter (where realized_pnl <= 0)::int as losses,
        count(*)::int as positions
      from position_stats_live where owner = ${owner} group by category order by pnl desc`,
    sql`select p.*, coalesce(e.title, m.title) as event_title, m.title as market_title, e.category, e.image_url
      from positions p left join markets m on m.market_id = p.market_id left join events e on e.event_id = coalesce(p.event_id, m.event_id)
      where p.owner = ${owner} order by p.value_usd desc nulls last, p.cost_usd desc`,
    sql`select ps.*, e.image_url from position_stats_live ps left join events e on e.event_id = ps.event_id
      where ps.owner = ${owner} and ps.realized_pnl is not null order by ps.closed_at desc nulls last limit 200`,
    sql`select h.id, h.event_type, h.signature, h.ts, h.market_id, h.is_buy, h.is_yes, h.contracts,
        h.avg_fill_price, h.total_cost_usd, h.realized_pnl_usd, h.payout_usd, h.title, h.verified_ok, m.title as market_title
      from history h left join markets m on m.market_id = h.market_id
      where h.owner = ${owner} and h.event_type in ('order_filled', 'payout_claimed', 'position_lost')
      order by h.ts desc limit 200`,
    sql<{ t: Date; pnl: number }[]>`select date_trunc('hour', ts) as t, sum(realized_pnl_usd)::float8 as pnl
      from history where owner = ${owner} and realized_pnl_usd is not null group by 1 order by 1`,
    sql`select history_at from wallets where owner = ${owner}`,
  ]);
  return { profile, stats, rank, byCategory, open, closed, history, series, complete: !!w?.history_at };
}

// ---- Activity: the live Solana trade feed ----

export type FeedRow = {
  id: string; owner: string; market_id: string; event_id: string; action: string; side: string; amount_usd: number; price: number;
  ts: Date; event_title: string; market_title: string; category: string | null; image_url: string | null; trader_pnl: number | null;
};

export async function activity(opts: { category?: string; min?: number; top?: boolean; limit?: number } = {}) {
  const { category = "All", min = 0, top = false, limit = 100 } = opts;
  return sql<FeedRow[]>`
    with tp as (select owner, sum(realized_pnl)::float8 as pnl from position_stats where realized_pnl is not null group by owner)
    select t.id, t.owner, t.market_id, t.event_id, t.action, t.side, t.amount_usd::float8, t.price::float8, t.ts,
      t.event_title, t.market_title, e.category, e.image_url, tp.pnl as trader_pnl
    from trades t left join events e on e.event_id = t.event_id left join tp on tp.owner = t.owner
    where t.amount_usd >= ${min}
      and ${category === "All" ? sql`true` : sql`e.category = ${category}`}
      and ${top ? sql`tp.pnl > 0` : sql`true`}
    order by t.ts desc limit ${limit}`;
}

export async function activityStats() {
  const [s] = await sql<{ trades_24h: number; volume_24h: number; traders_24h: number }[]>`
    select count(*)::int as trades_24h, coalesce(sum(amount_usd), 0)::float8 as volume_24h, count(distinct owner)::int as traders_24h
    from trades where ts > now() - interval '24 hours'`;
  return s;
}

// ---- Markets: where top Solana traders hold positions right now ----

export type MarketRow = {
  market_id: string; event_id: string | null; title: string | null; outcome: string | null; category: string | null; image_url: string | null;
  holders: number; yes_usd: number; no_usd: number; price: number | null; smart_odds: number | null; pm_odds: number | null; pm_price: number | null;
};

export async function markets(opts: { category?: string; q?: string; limit?: number } = {}) {
  const { category = "All", q, limit = 100 } = opts;
  return sql<MarketRow[]>`
    select p.market_id, max(coalesce(p.event_id, m.event_id)) as event_id, max(e.title) as title, max(m.title) as outcome,
      max(e.category) as category, max(e.image_url) as image_url, count(distinct p.owner)::int as holders,
      coalesce(sum(p.value_usd) filter (where p.is_yes), 0)::float8 as yes_usd,
      coalesce(sum(p.value_usd) filter (where not p.is_yes), 0)::float8 as no_usd,
      avg(case when p.is_yes then p.mark_price else 1 - p.mark_price end)::float8 as price,
      (sum(p.value_usd) filter (where p.is_yes) / nullif(sum(p.value_usd), 0))::float8 as smart_odds,
      max(pm.smart_odds)::float8 as pm_odds, max(pm.market_price)::float8 as pm_price
    from positions p
    left join markets m on m.market_id = p.market_id
    left join events e on e.event_id = coalesce(p.event_id, m.event_id)
    left join polymarket_smart_money pm on pm.market_id = p.market_id
    where p.value_usd is not null and p.value_usd > 0
      and ${category === "All" ? sql`true` : sql`e.category = ${category}`}
      and ${q ? sql`(e.title ilike ${"%" + q + "%"} or m.title ilike ${"%" + q + "%"})` : sql`true`}
    group by p.market_id
    order by holders desc, sum(p.value_usd) desc limit ${limit}`;
}

export async function marketDetail(marketId: string) {
  const [summary] = await markets({ q: undefined, limit: 1000 }).then((rows) => rows.filter((r) => r.market_id === marketId));
  const [meta] = await sql`select m.*, e.title as event_title, e.category, e.image_url, e.close_time as event_close
    from markets m left join events e on e.event_id = m.event_id where m.market_id = ${marketId}`;
  const holders = await sql`
    with tp as (select owner, sum(realized_pnl)::float8 as pnl, count(*)::int as positions,
        (100.0 * count(*) filter (where realized_pnl > 0) / nullif(count(*), 0))::float8 as win_rate
      from position_stats where realized_pnl is not null group by owner)
    select p.owner, p.pubkey, p.is_yes, p.contracts::float8, p.avg_price::float8, p.mark_price::float8, p.value_usd::float8,
      p.pnl_usd::float8, p.opened_at, tp.pnl as trader_pnl, tp.positions as trader_positions, tp.win_rate as trader_win_rate
    from positions p left join tp on tp.owner = p.owner
    where p.market_id = ${marketId} and p.value_usd is not null order by p.value_usd desc`;
  const [pm] = await sql`select * from polymarket_smart_money where market_id = ${marketId}`;
  const trades = await sql<FeedRow[]>`
    with tp as (select owner, sum(realized_pnl)::float8 as pnl from position_stats where realized_pnl is not null group by owner)
    select t.id, t.owner, t.action, t.side, t.amount_usd::float8, t.price::float8, t.ts, t.event_title, t.market_title, tp.pnl as trader_pnl
    from trades t left join tp on tp.owner = t.owner where t.market_id = ${marketId} order by t.ts desc limit 50`;
  return { summary, meta, holders, pm, trades };
}
