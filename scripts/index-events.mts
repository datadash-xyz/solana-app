// Pulls every event (with markets) for each provider and stores category metadata.
// Usage: tsx scripts/index-events.mts [provider...] [--max 3000]   (default: polymarket kalshi bisonfi)
// Takes the top events by volume; events our wallets trade outside that set are fetched by index-wallets.
import "dotenv/config";
import { sql } from "../src/lib/db";
import { jupAll, type JEvent } from "../src/lib/jupiter";
import { saveEvents } from "../src/lib/save";

const mi = process.argv.indexOf("--max");
const max = mi > -1 ? Number(process.argv[mi + 1]) : 3000;
const named = process.argv.slice(2).filter((a, i, all) => a !== "--max" && all[i - 1] !== "--max");
const providers = named.length ? named : ["polymarket", "kalshi", "bisonfi"];
for (const provider of providers) {
  let markets = 0;
  const events = await jupAll<JEvent>("/events", { provider, includeMarkets: true, sortBy: "volume", sortDirection: "desc" }, 100, max, async (page, n) => {
    markets += await saveEvents(page, provider);
    if (n % 1000 === 0) console.log(`${provider}: ${n} events…`);
  });
  console.log(`${provider}: ${events.length} events, ${markets} markets`);
}
await sql.end();
