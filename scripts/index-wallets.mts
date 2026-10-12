// Backfills profile, positions and full history for each wallet in the universe.
// Usage: tsx scripts/index-wallets.mts [--limit 200] [--stale-hours 12] [--wallet <pubkey>]
// Same jobs the Temporal `walletBackfill` workflow runs (src/pipeline/jobs.ts).
import "dotenv/config";
import { sql } from "../src/lib/db";
import { backfillMissingEvents, indexWallet, listWalletsToIndex, refreshViews } from "../src/pipeline/jobs";

const arg = (name: string, def?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
const one = arg("wallet");
const owners = one ? [one] : await listWalletsToIndex(Number(arg("limit", "100000")), Number(arg("stale-hours", "12")));

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
const ev = await backfillMissingEvents(1000);
console.log(`missing events: ${ev.saved}/${ev.missing} saved`);
const v = await refreshViews();
console.log(`position_stats refreshed: ${v.positions} positions`);
await sql.end();
