// Rebuilds derived views after indexing. Usage: tsx scripts/refresh.mts
import "dotenv/config";
import { sql } from "../src/lib/db";
import { refreshViews } from "../src/pipeline/jobs";

const r = await refreshViews();
console.log(`position_stats: ${r.positions} positions in ${r.seconds}s`);
await sql.end();
