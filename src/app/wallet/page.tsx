import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isSolanaAddress } from "@/lib/format";

export default function WalletLookup({ searchParams }: PageProps<"/wallet">) {
  return (
    <div className="mx-auto max-w-2xl pt-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Look up any Solana wallet</h1>
      <p className="mt-2 text-muted">Paste a wallet address to see its prediction-market portfolio, PnL by category, and every trade verified on Solana.</p>
      <form action="/wallet" className="mt-6 flex gap-2">
        <input
          name="addr"
          placeholder="Solana wallet address"
          autoComplete="off"
          spellCheck={false}
          className="num flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-sm outline-none focus:border-violet"
        />
        <button className="rounded-xl bg-text px-5 text-sm font-semibold text-bg">View</button>
      </form>
      <Suspense>
        <Lookup searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Lookup({ searchParams }: { searchParams: PageProps<"/wallet">["searchParams"] }) {
  const addr = String((await searchParams).addr ?? "").trim();
  if (!addr) return null;
  if (isSolanaAddress(addr)) redirect(`/wallet/${addr}`);
  return <p className="mt-3 text-sm text-down">That doesn&apos;t look like a Solana address.</p>;
}
