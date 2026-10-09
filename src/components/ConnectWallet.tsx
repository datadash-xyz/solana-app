"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";

type ConnectFeature = { connect: () => Promise<{ accounts: readonly { address: string }[] }> };
type DisconnectFeature = { disconnect: () => Promise<void> };
const KEY = "dd-sol-wallet";

const isSolanaWallet = (w: Wallet) => w.chains.some((c) => c.startsWith("solana:")) && "standard:connect" in w.features;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

// Read-only wallet connect (Wallet Standard: Phantom, Solflare, Backpack…). We only read the
// public address to open the user's own portfolio; nothing is ever signed.
export function ConnectWallet() {
  const router = useRouter();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [addr, setAddr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const api = getWallets();
    const sync = () => setWallets(api.get().filter(isSolanaWallet));
    sync();
    const offs = [api.on("register", sync), api.on("unregister", sync)];
    try {
      setAddr(localStorage.getItem(KEY));
    } catch {}
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => {
      offs.forEach((off) => off());
      document.removeEventListener("mousedown", close);
    };
  }, []);

  async function connect(w: Wallet) {
    setErr(null);
    try {
      const { accounts } = await (w.features["standard:connect"] as ConnectFeature).connect();
      const a = accounts[0]?.address;
      if (!a) return setErr("No account shared");
      setAddr(a);
      try {
        localStorage.setItem(KEY, a);
      } catch {}
      setOpen(false);
      router.push(`/wallet/${a}`);
    } catch {
      setErr("Connection cancelled");
    }
  }

  async function disconnect() {
    for (const w of wallets) {
      const f = w.features["standard:disconnect"] as DisconnectFeature | undefined;
      await f?.disconnect().catch(() => {});
    }
    setAddr(null);
    try {
      localStorage.removeItem(KEY);
    } catch {}
    setOpen(false);
  }

  return (
    <div ref={box} className="relative">
      {addr ? (
        <button onClick={() => setOpen(!open)} className="num flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm hover:border-muted">
          <span className="h-2 w-2 rounded-full bg-up" />
          {short(addr)}
        </button>
      ) : (
        <button onClick={() => setOpen(!open)} className="rounded-full bg-violet-strong px-4 py-1.5 text-sm font-medium text-white hover:opacity-90">
          Connect wallet
        </button>
      )}
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-line bg-panel p-2 shadow-2xl">
          {addr ? (
            <>
              <button onClick={() => (setOpen(false), router.push(`/wallet/${addr}`))} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-2">
                My portfolio
              </button>
              <button onClick={disconnect} className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-panel-2">
                Disconnect
              </button>
            </>
          ) : wallets.length ? (
            <>
              <p className="px-3 pb-2 pt-1 text-xs text-dim">Read-only. We only read your public address.</p>
              {wallets.map((w) => (
                <button key={w.name} onClick={() => connect(w)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.icon} alt="" className="h-6 w-6 rounded-md" />
                  {w.name}
                </button>
              ))}
            </>
          ) : (
            <p className="px-3 py-2 text-sm text-muted">
              No Solana wallet found. Install{" "}
              <a className="text-violet hover:underline" href="https://phantom.com" target="_blank" rel="noreferrer">
                Phantom
              </a>
              ,{" "}
              <a className="text-violet hover:underline" href="https://solflare.com" target="_blank" rel="noreferrer">
                Solflare
              </a>{" "}
              or{" "}
              <a className="text-violet hover:underline" href="https://backpack.app" target="_blank" rel="noreferrer">
                Backpack
              </a>
              , or paste any address in search.
            </p>
          )}
          {err && <p className="px-3 pt-1 text-xs text-down">{err}</p>}
        </div>
      )}
    </div>
  );
}
