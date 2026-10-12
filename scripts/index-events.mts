// Pulls the top events (with markets) for each provider and stores category metadata.
// Usage: tsx scripts/index-events.mts [provider...] [--max 3000]   (default: polymarket kalshi bisonfi)
// Same job the Temporal `eventsSync` workflow runs (src/pipeline/jobs.ts).
import "dotenv/config";
import { sql } from "../src/lib/db";
import type { Provider } from "../src/pipeline/connectors/jupiter";
import { syncEvents } from "../src/pipeline/jobs";

const mi = process.argv.indexOf("--max");
const max = mi > -1 ? Number(process.argv[mi + 1]) : 3000;
const named = process.argv.slice(2).filter((a, i, all) => a !== "--max" && all[i - 1] !== "--max") as Provider[];
for (const provider of named.length ? named : (["polymarket", "kalshi", "bisonfi"] as Provider[])) {
  const r = await syncEvents(provider, max, (d) => d.endsWith("000 events") && console.log(d));
  console.log(`${provider}: ${r.events} events, ${r.markets} markets`);
}
await sql.end();
