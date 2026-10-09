// Polymarket smart money (Datadash top 1,000 wallets by all-time PnL) for markets that top
// Solana traders also hold. Pulled from the Datadash MCP on 2026-10-10.
// Usage: tsx scripts/seed-polymarket-snapshot.mts
import "dotenv/config";
import { sql } from "../src/lib/db";

const SNAPSHOT_AT = new Date("2026-10-10T12:00:00Z");
// [marketId, eventId, smartPct, marketPct, yesValue, noValue, yesWallets, noWallets]
const ROWS: [number, number, number, number, number, number, number, number][] = [
  [1163699, 158505, 16.045795, 4.807751, 92630.32, 484656.9, 34, 16],
  [601826, 45915, 93.81606, 88.988989, 2259970.46, 148967.27, 44, 31],
  [601819, 45915, 6.18394, 11.011011, 148967.27, 2259970.46, 31, 44],
  [2589812, 606422, 83.296408, 83, 1108206.62, 222230.85, 26, 36],
  [2589813, 606422, 16.213634, 16, 215712.26, 1114725.21, 27, 37],
  [562831, 32228, 2.05092, 8.902077, 29178.98, 1393547.18, 22, 67],
  [562828, 32228, 66.833662, 62.31454, 950859.99, 471866.17, 49, 55],
  [608547, 48361, 66.230676, 63.924678, 307284.79, 156676.64, 30, 37],
  [608566, 48361, 1.050652, 0.99108, 4874.62, 459086.81, 29, 42],
  [701552, 89519, 0.555978, 7.832615, 4077.66, 729344.07, 5, 6],
  [560317, 31195, 37.844481, 3.4, 39111.81, 64236.97, 5, 23],
];

const rows = ROWS.map(([m, e, smart, market, yes, no, yw, nw]) => ({
  market_id: `POLY-${m}`, event_id: `POLY-${e}`, title: null, outcome: null,
  smart_yes_usd: yes, smart_no_usd: no, smart_odds: smart / 100, market_price: market / 100, traders: yw + nw, snapshot_at: SNAPSHOT_AT,
}));
await sql`insert into polymarket_smart_money ${sql(rows)} on conflict (market_id) do update set
  smart_yes_usd = excluded.smart_yes_usd, smart_no_usd = excluded.smart_no_usd, smart_odds = excluded.smart_odds,
  market_price = excluded.market_price, traders = excluded.traders, snapshot_at = excluded.snapshot_at`;
console.log(`saved ${rows.length} Polymarket smart money rows`);
await sql.end();
