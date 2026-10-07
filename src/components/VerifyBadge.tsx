"use client";

import { useState } from "react";

type State = "ok" | "fail" | "idle" | "loading";

// Shows whether a trade's transaction is confirmed on Solana. Unchecked trades can be
// verified live (our API asks Helius RPC for the transaction).
export function VerifyBadge({ signature, verified }: { signature: string; verified: boolean | null }) {
  const [state, setState] = useState<State>(verified === true ? "ok" : verified === false ? "fail" : "idle");
  const solscan = `https://solscan.io/tx/${signature}`;

  async function check() {
    setState("loading");
    try {
      const r = await fetch(`/api/verify/${signature}`);
      const j = await r.json();
      setState(j.ok ? "ok" : "fail");
    } catch {
      setState("fail");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      {state === "ok" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#0f2a20] px-2 py-0.5 text-xs font-medium text-up" title="Transaction finalized on Solana">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 8.5l3 3 7-7" /></svg>
          On Solana
        </span>
      )}
      {state === "fail" && <span className="rounded-full bg-[#2a1216] px-2 py-0.5 text-xs text-down">Not found</span>}
      {(state === "idle" || state === "loading") && (
        <button onClick={check} disabled={state === "loading"} className="rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:text-text">
          {state === "loading" ? "Checking…" : "Verify"}
        </button>
      )}
      <a href={solscan} target="_blank" rel="noreferrer" className="text-xs text-violet hover:underline">
        Solscan ↗
      </a>
    </span>
  );
}
