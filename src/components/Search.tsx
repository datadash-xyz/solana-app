"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const isAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

// One box for both: a Solana address opens that wallet, anything else searches markets.
export function Search() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        if (!v) return;
        router.push(isAddress(v) ? `/wallet/${v}` : `/markets?q=${encodeURIComponent(v)}`);
        setQ("");
      }}
      className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 focus-within:border-violet"
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-dim" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="9" cy="9" r="6" />
        <path d="M14 14l4 4" />
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search wallet or market"
        spellCheck={false}
        className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-dim"
      />
    </form>
  );
}
