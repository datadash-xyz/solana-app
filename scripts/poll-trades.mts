// Polls Jupiter's global trade feed (latest 20 trades) and keeps every trade we see.
// New traders are added to the wallet universe. Usage: tsx scripts/poll-trades.mts [--every 30] [--once]
// Same job the Temporal `tradeFeed` workflow runs (src/pipeline/jobs.ts).
import "dotenv/config";
import { sql } from "../src/lib/db";
import { pollTrades } from "../src/pipeline/jobs";

const i = process.argv.indexOf("--every");
const every = (i > -1 ? Number(process.argv[i + 1]) : 30) * 1000;
const once = process.argv.includes("--once");

do {
  try {
    const { inserted } = await pollTrades();
    if (inserted) console.log(`${new Date().toISOString()} +${inserted} trades`);
  } catch (e) {
    console.error((e as Error).message);
  }
  if (!once) await new Promise((r) => setTimeout(r, every));
} while (!once);
await sql.end();
