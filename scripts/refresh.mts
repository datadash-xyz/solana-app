// Rebuilds derived views after indexing. Usage: tsx scripts/refresh.mts
import "dotenv/config";
import { sql } from "../src/lib/db";

const t = Date.now();
await sql`refresh materialized view concurrently position_stats`;
const [{ n }] = await sql`select count(*)::int as n from position_stats`;
console.log(`position_stats: ${n} positions in ${((Date.now() - t) / 1000).toFixed(1)}s`);
await sql.end();
