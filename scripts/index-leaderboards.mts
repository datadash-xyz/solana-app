// Snapshots Jupiter's leaderboards (every period x metric, top 100 each) and the
// platform totals, and adds every ranked wallet to our wallet universe.
// Same job the Temporal `leaderboardSync` workflow runs (src/pipeline/jobs.ts).
import "dotenv/config";
import { sql } from "../src/lib/db";
import { syncLeaderboards } from "../src/pipeline/jobs";

const r = await syncLeaderboards((d) => console.log(d));
console.log(`wallet universe: ${r.wallets}`);
await sql.end();
