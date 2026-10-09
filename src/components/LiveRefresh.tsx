"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Re-renders the server page every `seconds` while live is on.
export function LiveRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(true);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [live, seconds, router]);
  return (
    <button onClick={() => setLive(!live)} className="pill" data-active={false}>
      <span className={`h-2 w-2 rounded-full ${live ? "animate-pulse bg-up" : "bg-dim"}`} />
      {live ? "Live" : "Paused"}
    </button>
  );
}
