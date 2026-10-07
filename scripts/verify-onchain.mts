// Confirms stored trades on Solana: looks up each history signature via Helius and
// records whether it is finalized on-chain. Usage: tsx scripts/verify-onchain.mts [--limit 20000]
import "dotenv/config";
import { sql } from "../src/lib/db";
import { verifySignatures } from "../src/lib/solana";

const i = process.argv.indexOf("--limit");
const limit = i > -1 ? Number(process.argv[i + 1]) : 20000;

const rows = await sql`select distinct signature from history
  where signature is not null and verified_at is null
    and event_type in ('order_filled', 'payout_claimed', 'position_lost')
  limit ${limit}`;
const sigs = rows.map((r) => r.signature as string);
console.log(`verifying ${sigs.length} signatures`);

let ok = 0;
for (let k = 0; k < sigs.length; k += 256) {
  const batch = sigs.slice(k, k + 256);
  const res = await verifySignatures(batch);
  const vals = batch.map((s) => ({ signature: s, ok: res.get(s)?.ok ?? false, slot: res.get(s)?.slot ?? null }));
  ok += vals.filter((v) => v.ok).length;
  await sql`update history h set verified_at = now(), verified_ok = v.ok::boolean
    from (values ${sql(vals.map((v) => [v.signature, String(v.ok)]))}) as v(signature, ok)
    where h.signature = v.signature`;
  console.log(`${Math.min(k + 256, sigs.length)}/${sigs.length} checked, ${ok} confirmed`);
}
await sql.end();
