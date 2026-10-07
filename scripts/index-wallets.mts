// Backfills profile, positions and full history for each wallet in the universe.
// Usage: tsx scripts/index-wallets.mts [--limit 200] [--stale-hours 12] [--wallet <pubkey>]
import "dotenv/config";
import { sql } from "../src/lib/db";
import { jup, type JEvent } from "../src/lib/jupiter";
import { saveEvents } from "../src/lib/save";
import { indexWallet } from "../src/lib/wallet";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const limit = Number(arg("limit", "100000"));
const staleHours = Number(arg("stale-hours", "12"));
const one = arg("wallet");

const owners: string[] = one
  ? [one]
  : (
      await sql`select w.owner from wallets w left join profiles p using (owner)
        where w.history_at is null or w.history_at < now() - make_interval(hours => ${staleHours})
        order by w.history_at nulls first, p.realized_pnl_usd desc nulls last
        limit ${limit}`
    ).map((r) => r.owner as string);

console.log(`indexing ${owners.length} wallets`);
let done = 0;
for (const owner of owners) {
  try {
    const r = await indexWallet(owner);
    done++;
    if (done % 10 === 0 || owners.length < 20) console.log(`${done}/${owners.length} ${owner.slice(0, 6)}… ${r.positions} positions, ${r.history} history`);
  } catch (e) {
    console.error(`failed ${owner}: ${(e as Error).message}`);
  }
}

// Fill in metadata for any event we saw in history/positions but haven't stored yet.
const missing = (
  await sql`select distinct event_id from (select event_id from history union select event_id from positions) x
    where event_id is not null and event_id not in (select event_id from events)`
).map((r) => r.event_id as string);
console.log(`fetching ${missing.length} missing events`);
for (const id of missing) {
  try {
    const ev = await jup<JEvent>(`/events/${encodeURIComponent(id)}`, { includeMarkets: true });
    await saveEvents([ev]);
  } catch (e) {
    console.error(`event ${id}: ${(e as Error).message.slice(0, 120)}`);
  }
}
await sql.end();
