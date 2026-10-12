// Confirms stored trades on Solana: looks up each history signature via Solana RPC (Helius)
// and records whether it is finalized on-chain. Usage: tsx scripts/verify-onchain.mts [--limit 20000]
// Same job the Temporal `onchainVerification` workflow runs (src/pipeline/jobs.ts).
import "dotenv/config";
import { sql } from "../src/lib/db";
import { verifyPending } from "../src/pipeline/jobs";

const i = process.argv.indexOf("--limit");
const r = await verifyPending(i > -1 ? Number(process.argv[i + 1]) : 20000, (d) => console.log(d));
console.log(`checked ${r.checked}, confirmed ${r.confirmed}, failed ${r.failed}`);
await sql.end();
