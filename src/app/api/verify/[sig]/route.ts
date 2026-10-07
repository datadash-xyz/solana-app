// Live on-chain check for one trade: fetches the transaction from Solana (Helius RPC)
// and records the result against our stored history.
import { sql } from "@/lib/db";
import { getTx } from "@/lib/solana";

export async function GET(_req: Request, ctx: RouteContext<"/api/verify/[sig]">) {
  const { sig } = await ctx.params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(sig)) return Response.json({ ok: false, error: "invalid signature" }, { status: 400 });

  const tx = await getTx(sig).catch(() => null);
  const ok = !!tx?.ok;
  await sql`update history set verified_at = now(), verified_ok = ${ok} where signature = ${sig}`;
  return Response.json({ ok, signature: sig, slot: tx?.slot ?? null, blockTime: tx?.blockTime ?? null, programs: tx?.programs ?? [] });
}
