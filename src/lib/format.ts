export const short = (addr: string, n = 4) => `${addr.slice(0, n)}…${addr.slice(-n)}`;

export function money(v: number | string | null | undefined, opts: { sign?: boolean } = {}) {
  if (v === null || v === undefined) return "–";
  const n = Number(v);
  const abs = Math.abs(n);
  const body =
    abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `${(abs / 1e3).toFixed(1)}K` : abs.toFixed(abs < 10 ? 2 : 0);
  const sign = n < 0 ? "-" : opts.sign && n > 0 ? "+" : "";
  return `${sign}$${body}`;
}

export const pnlClass = (v: number | string | null | undefined) => (v === null || v === undefined || Number(v) === 0 ? "text-muted" : Number(v) > 0 ? "text-up" : "text-down");

export const cents = (v: number | string | null | undefined) => (v === null || v === undefined ? "–" : `${Math.round(Number(v) * 100)}¢`);

export function ago(d: Date | string | null | undefined) {
  if (!d) return "–";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 60) return `${Math.round(s / 86400)}d ago`;
  return new Date(d).toISOString().slice(0, 10);
}

export const isSolanaAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
