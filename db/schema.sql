-- datadash-solana schema. All money columns are USD (already divided from micro-USD).

create table if not exists events (
  event_id     text primary key,          -- e.g. POLY-158505, BISON-..., Kalshi tickers
  provider     text,
  category     text,
  subcategory  text,
  title        text,
  slug         text,
  image_url    text,
  close_time   timestamptz,
  volume_usd   numeric,
  is_active    boolean,
  tags         text[],
  updated_at   timestamptz not null default now()
);
create index if not exists events_category on events (category);

create table if not exists markets (
  market_id   text primary key,
  event_id    text,
  provider    text,
  title       text,
  status      text,
  result      text,
  buy_yes     numeric,                    -- price per contract, 0..1
  buy_no      numeric,
  close_time  timestamptz,
  updated_at  timestamptz not null default now()
);
create index if not exists markets_event on markets (event_id);

-- Jupiter's own global leaderboards (top 100 per period x metric), snapshotted.
create table if not exists leaderboard (
  period            text not null,
  metric            text not null,
  rank              int  not null,
  owner             text not null,
  realized_pnl_usd  numeric,
  volume_usd        numeric,
  predictions       int,
  correct           int,
  wrong             int,
  win_rate          numeric,
  fetched_at        timestamptz not null default now(),
  primary key (period, metric, owner)
);

create table if not exists platform_summary (
  period       text primary key,
  volume_usd   numeric,
  predictions  bigint,
  fetched_at   timestamptz not null default now()
);

-- The wallet universe we index, and where each wallet came from.
create table if not exists wallets (
  owner        text primary key,
  source       text,                      -- leaderboard | trades | holders
  first_seen   timestamptz not null default now(),
  profiled_at  timestamptz,
  history_at   timestamptz
);

create table if not exists profiles (
  owner                text primary key,
  realized_pnl_usd     numeric,
  volume_usd           numeric,
  predictions          int,
  correct              int,
  wrong                int,
  positions_value_usd  numeric,
  fetched_at           timestamptz not null default now()
);

create table if not exists positions (
  pubkey            text primary key,     -- position account on Solana
  owner             text not null,
  market_id         text,
  event_id          text,
  is_yes            boolean,
  contracts         numeric,
  cost_usd          numeric,
  value_usd         numeric,
  avg_price         numeric,
  mark_price        numeric,
  pnl_usd           numeric,
  realized_pnl_usd  numeric,
  claimed           boolean,
  opened_at         timestamptz,
  updated_at        timestamptz,
  fetched_at        timestamptz not null default now()
);
create index if not exists positions_owner on positions (owner);
create index if not exists positions_market on positions (market_id);

-- Every order/fill/payout, with the Solana transaction signature.
create table if not exists history (
  id                bigint primary key,
  owner             text not null,
  event_type        text,
  signature         text,
  slot              bigint,
  ts                timestamptz,
  market_id         text,
  event_id          text,
  position_pubkey   text,
  is_buy            boolean,
  is_yes            boolean,
  contracts         numeric,
  avg_fill_price    numeric,
  total_cost_usd    numeric,
  fee_usd           numeric,
  realized_pnl_usd  numeric,
  payout_usd        numeric,
  title             text,
  verified_at       timestamptz,          -- set once the signature is confirmed on Solana RPC
  verified_ok       boolean
);
create index if not exists history_owner_ts on history (owner, ts desc);
create index if not exists history_event on history (event_id);

-- Global trade feed (Jupiter only returns the latest 20, so we poll and keep it).
create table if not exists trades (
  id            text primary key,
  owner         text,
  market_id     text,
  event_id      text,
  action        text,
  side          text,
  amount_usd    numeric,
  price         numeric,
  ts            timestamptz,
  event_title   text,
  market_title  text
);
create index if not exists trades_ts on trades (ts desc);

-- Raw provider category (Kalshi/Forecast/Polymarket use different names); `category` holds the normalized one.
alter table events add column if not exists category_raw text;
