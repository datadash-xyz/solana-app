// Confirms Jupiter's reported trades directly on Solana (via Helius RPC),
// so every trade we show can carry a "Verified on Solana" badge.

const RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY ?? ""}`;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result as T;
}

export type SigStatus = { slot: number; confirmationStatus: string | null; err: unknown } | null;

// Up to 256 signatures per call. `ok` = finalized/confirmed and no on-chain error.
export async function verifySignatures(sigs: string[]) {
  const out = new Map<string, { ok: boolean; slot: number | null; status: string | null }>();
  for (let i = 0; i < sigs.length; i += 256) {
    const batch = sigs.slice(i, i + 256);
    const r = await rpc<{ value: SigStatus[] }>("getSignatureStatuses", [batch, { searchTransactionHistory: true }]);
    r.value.forEach((s, j) =>
      out.set(batch[j], { ok: !!s && !s.err && !!s.confirmationStatus, slot: s?.slot ?? null, status: s?.confirmationStatus ?? null }),
    );
  }
  return out;
}

// Full transaction, for the "proof" panel: signer, slot, time and programs invoked.
export async function getTx(signature: string) {
  type Tx = {
    slot: number;
    blockTime: number | null;
    meta: { err: unknown; fee: number } | null;
    transaction: { message: { accountKeys: { pubkey: string; signer: boolean }[]; instructions: { programId: string }[] } };
  };
  const t = await rpc<Tx | null>("getTransaction", [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
  if (!t) return null;
  return {
    slot: t.slot,
    blockTime: t.blockTime,
    ok: !t.meta?.err,
    feeLamports: t.meta?.fee ?? null,
    signers: t.transaction.message.accountKeys.filter((k) => k.signer).map((k) => k.pubkey),
    programs: [...new Set(t.transaction.message.instructions.map((i) => i.programId))],
  };
}

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`;
export const solscanAccount = (addr: string) => `https://solscan.io/account/${addr}`;
