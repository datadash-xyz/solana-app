# Datadash on Solana

**The intelligence layer for prediction markets, now on Solana.**

Datadash ranks Solana prediction-market traders by category, rebuilds every trader's portfolio from on-chain history, follows their trades live, and checks each trade against the Solana blockchain.

**Live:** https://datadash-solana.vercel.app

Built for [Colosseum's Crypto World's Fair](https://www.colosseum.com) (Week 4, Oct 6–12, 2026). See [Hackathon disclosure](#hackathon-disclosure).

---

## What it does

| Page | What you get |
|---|---|
| **Leaderboard** (`/leaderboard`) | Solana traders ranked by realized PnL, **in every category** (Sports, Crypto, Esports, Politics, Economics, Finance, Tech, Culture…). Columns: PnL, ROI, win rate, positions, profit factor, volume and average hold time. Sort by any of them; filter by 1D / 1W / 1M / 1Y / ALL; search by wallet. |
| **Trader page** (`/wallet/[address]`) | Portfolio, Activity and Category tabs. PnL chart with 1D–ALL ranges; win-rate and profit-factor gauges; average PnL per position, average size, holding time and max drawdown; active and closed positions (Won / Lost / Sold, ROI, time held). Every trade links to its Solana transaction with a **Verified on Solana** badge, and any trade can be re-checked live. Any Solana address works: wallets we have not indexed yet are fetched on first visit. |
| **Activity** (`/activity`) | Every trade on Jupiter's prediction markets as it lands, with the trader's track record beside it. Filters for category, size ($100+ / $1K+ / $10K+) and profitable traders only. Refreshes every 30 seconds. |
| **Markets** (`/markets`) | Where top Solana traders hold positions right now: how many hold each market, the money held, their Yes / No split and the price. |
| **Same market, two chains** (`/markets/[id]`) | Many Jupiter markets are Polymarket markets. For those, the market price, the top Solana traders' positioning and the [Datadash](https://datadash.xyz) Polymarket top-1,000 smart money sit side by side, with every Solana holder listed. |
| **Connect wallet** | Read-only Solana wallet connect (Wallet Standard: Phantom, Solflare, Backpack…) that opens your own portfolio. We only read the public address; nothing is ever signed. |

Snapshot on Oct 12, 2026: **626 Solana traders** indexed, **38,282 positions** rebuilt, **82,077 Solana transactions verified**.

## How it uses Solana

- **Venue:** [Jupiter Prediction](https://developers.jup.ag/docs/prediction), the Solana prediction market that routes Polymarket and Kalshi liquidity and runs Jupiter's own Forecast markets. Every position is a Solana account owned by the trader's wallet.
- **On-chain proof:** each fill, payout and loss in a trader's history carries its Solana transaction signature. `scripts/verify-onchain.mts` confirms them in batches with `getSignatureStatuses` (via [Helius](https://helius.dev) RPC), and `/api/verify/[sig]` fetches a single transaction live with `getTransaction` (slot, block time and the programs it invoked, including Jupiter's prediction program `3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp`). Trades and position accounts link to [Solscan](https://solscan.io).
- **Wallets:** Solana wallets are the identity. Connect one through the Wallet Standard, or paste any address.

## Architecture

```
                    connectors                       Temporal pipeline                       storage            app
Jupiter Prediction API ─┐                ┌─ leaderboardSync      (hourly schedule)
Solana RPC (Helius) ────┼─► jobs ◄───────┼─ eventsSync           (every 6h)          ──►  Postgres  ──►  Next.js 16 on Vercel (fra1)
Postgres ───────────────┘  (one impl.    ├─ walletBackfill       (every 6h, batched)        (Neon)        leaderboard · wallet · activity
                            per step)    ├─ onchainVerification  (hourly)                                 markets · two chains
                                         ├─ tradeFeed            (long-running poller)
                                         └─ fullRefresh          (all of the above as child workflows)
Datadash MCP (Polymarket smart money) ──► seed-polymarket-snapshot ──► Postgres
```

- `src/pipeline/connectors/`: one connector per external system, each with a `health()` check.
  - `jupiter.ts`: Jupiter Prediction API (leaderboards, events, profiles, positions, history, trade feed).
  - `solana.ts`: Solana JSON-RPC via Helius (`getSignatureStatuses`, `getTransaction`, `getSlot`).
  - `postgres.ts`: the sink, plus the queries that pick work (stale wallets, unverified signatures) and refresh views.
- `src/pipeline/jobs.ts`: each pipeline step, implemented once. The CLI scripts and the Temporal activities both call these.
- `src/pipeline/activities.ts`, `workflows.ts`, `temporal.ts`: the Temporal layer (see [Data pipeline](#data-pipeline-temporal)).
- `src/lib/jupiter.ts`: API client underneath the Jupiter connector. Converts micro-USD, paces requests to the plan's rate limit, retries on 429 using `x-ratelimit-reset`, and times out stalled requests.
- `src/lib/wallet.ts`: indexes one wallet (profile, positions, full history) and stores event metadata embedded in history rows.
- `src/lib/queries.ts`: every read the pages make.
- `db/schema.sql`: tables plus `position_stats`, one row per position account rebuilt from history. It exists as a live view (`position_stats_live`, used on trader pages so new wallets appear at once) and a materialized view (`position_stats`, used by the leaderboard).

## Data pipeline (Temporal)

Indexing runs as [Temporal](https://temporal.io) workflows, so every step is retried, observable and resumable.

| Workflow | What it does | Runs |
|---|---|---|
| `leaderboardSync` | Snapshots Jupiter's 9 leaderboards and grows the wallet universe | Schedule, hourly |
| `eventsSync` | Events, markets and categories per provider (Polymarket, Kalshi, Jupiter Forecast) | Schedule, every 6h |
| `walletBackfill` | Re-indexes stale wallets in batches. One activity per wallet, retried on its own; parallel lanes share the Jupiter rate budget; **continues-as-new** after each batch so history stays small; wallets that exhaust retries are skipped for the rest of the run. Ends by refreshing `position_stats`. | Schedule, every 6h |
| `onchainVerification` | Confirms every unchecked trade signature on Solana, in rounds | Schedule, hourly |
| `tradeFeed` | Long-running poller for Jupiter's trade feed (latest 20 only). `stats` query, `stop` signal, continues-as-new every 500 polls | Started once |
| `fullRefresh` | Checks every connector's health, then runs the four stages above as **child workflows** | On demand |

Activity policies: short calls get a 2-minute timeout and up to 5 retries with backoff; paging calls get 45 minutes, a 3-minute **heartbeat timeout** (activities heartbeat as pages arrive) and 3 retries. The worker keeps activity concurrency at 4 because all Jupiter calls in the process share one request-rate budget.

```bash
temporal server start-dev            # local Temporal (or set TEMPORAL_ADDRESS / TEMPORAL_NAMESPACE / TEMPORAL_API_KEY for Temporal Cloud)
npm run pipeline:health              # check every connector
npm run pipeline:worker              # run the worker (keep running)
npm run pipeline:schedules           # create / update the four schedules
npx tsx scripts/pipeline.mts start-trade-feed
npx tsx scripts/pipeline.mts run walletBackfill '{"batchSize":10,"maxBatches":1}'
npm run pipeline:e2e                 # end-to-end test on a throwaway local Temporal server
```

The `index:*`, `poll:trades` and `verify:onchain` scripts call the same jobs without Temporal, for one-off runs.

### How the numbers are computed

| Metric | Definition |
|---|---|
| Realized PnL | Sum of `realizedPnl` on the trader's history events (sells, payouts, losses). In our spot checks it matched Jupiter's own profile figure to the cent. |
| ROI | Realized PnL ÷ cost of the positions closed in the period. |
| Win rate | Share of closed positions that closed in profit. |
| Profit factor | Gross profit ÷ gross loss on closed positions (capped at 100). |
| Hold time | Average time from first buy to close. |
| Volume | USDC spent on filled buys. |
| Trader odds (Markets) | Share of the traders' current position value on Yes. |

ROI, win-rate and profit-factor rankings need at least 5 closed positions, so one lucky trade can't top the board.

## Run it yourself

**Requirements:** Node 20+, a Postgres database ([Neon](https://neon.tech) free tier works), a [Jupiter API key](https://developers.jup.ag/portal) (free) and a [Helius API key](https://dashboard.helius.dev) (free).

```bash
git clone https://github.com/datadash-xyz/solana-app.git && cd solana-app
npm install
cp .env.example .env   # fill in DATABASE_URL, JUPITER_API_KEY, HELIUS_API_KEY
npm run db:migrate
```

Load data with the [Temporal pipeline](#data-pipeline-temporal), or with the one-off scripts (in this order):

```bash
npm run index:leaderboards   # Jupiter's boards → wallet universe + platform totals
npm run index:events         # top events per provider, with categories
npm run index:wallets        # profile, positions and full history per wallet; refreshes position_stats
npm run verify:onchain       # confirm every trade signature on Solana
npm run poll:trades          # keep running: live trade feed, adds new wallets
npm run dev                  # http://localhost:3000
```

Optional: `npx tsx scripts/seed-polymarket-snapshot.mts` loads the Polymarket smart-money snapshot used by "same market, two chains". Run `npm run db:refresh` after any manual reindex.

| Script | Purpose |
|---|---|
| `db:migrate` | Apply `db/schema.sql` |
| `index:leaderboards` | Snapshot Jupiter leaderboards (all_time / monthly / weekly × pnl / volume / win_rate) |
| `index:events [provider…] [--max 3000]` | Events and markets for `polymarket`, `kalshi`, `bisonfi` (Jupiter Forecast) |
| `index:wallets [--limit N] [--stale-hours H] [--wallet ADDR]` | Backfill wallets |
| `poll:trades [--every 30]` | Poll the global trade feed |
| `verify:onchain [--limit N]` | Verify stored signatures via Solana RPC |
| `db:refresh` | Rebuild the `position_stats` materialized view |
| `pipeline:*` | Temporal worker, health, schedules and end-to-end test (see above) |

### Deploying

`vercel.json` pins functions to `fra1`: **Jupiter's Prediction API blocks US and South Korean IP addresses**, so the app must run outside those regions. Add `DATABASE_URL`, `JUPITER_API_KEY` and `HELIUS_API_KEY` as Vercel environment variables. The indexer runs separately (locally or on any non-US host).

## Things we learned about the Jupiter Prediction API

- **`/history` returns uneven pages.** The next page starts at `pagination.end`, not `start + pageSize`, and once the data runs out it keeps returning empty pages with `hasNext: true`. Stepping by page size silently drops trades: one wallet showed $58.4K realized PnL instead of the real $43,755.73 until we fixed it.
- **The rate limit is per organisation** (free key: 1 request/second over a 60-second window), shared by every process using the key. Set `JUPITER_RPS` to your plan's rate.
- **History rows embed event and market metadata** (category, tags, title, status), so there is no need for one `/events` lookup per market.
- **`/positions` requires an owner.** There is no "all holders of a market" endpoint, so the Markets page covers the wallets we index.
- **Categories differ by provider** (Kalshi uses `financials`, `companies`, `world`…; Forecast uses `finance`). `normCategory` in `src/lib/save.ts` maps them onto one set.

## Limitations

- The Solana side of the trader-positioning views covers our indexed wallets (Jupiter's leaderboards plus traders seen in the live feed), so the samples are small: often 2–5 top traders per market. The page says so.
- The Polymarket smart-money figures are a dated snapshot (Oct 10, 2026) from the Datadash MCP, labelled with that date.
- Open-position prices are marked at the last index run.
- Very active (bot) wallets keep their latest 5,000 history events. Headline totals still come from Jupiter.
- Read-only by design: no trading, and no keys or signatures are ever requested from users.

## Hackathon disclosure

- **New in this repo (built Oct 6–12, 2026):** everything here. That covers the Jupiter indexer, on-chain verification, category leaderboards, trader pages, activity feed, markets and "same market, two chains" views, and wallet connect.
- **Pre-existing:** [Datadash](https://datadash.xyz) itself, our Polymarket analytics product (leaderboards, trader portfolios, Smart Money, Signals, Cohorts, Alerts and the Datadash MCP), which existed before the hackathon. This repo reuses its product design and, for the Polymarket comparison only, its smart-money data.

## License

[MIT](LICENSE)

## Credits

Data from the [Jupiter Prediction API](https://developers.jup.ag/docs/prediction). Solana RPC by [Helius](https://helius.dev). Polymarket smart money from [Datadash](https://datadash.xyz).

Public on-chain data. **Not financial advice.**
