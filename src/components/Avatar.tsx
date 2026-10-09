// Deterministic gradient avatar from a wallet address, with an optional rank medal.
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const MEDAL: Record<number, string> = { 1: "#f5b400", 2: "#c7ccd6", 3: "#d08a4e" };

export function Avatar({ addr, size = 36, rank }: { addr: string; size?: number; rank?: number }) {
  const h = hash(addr);
  const a = h % 360, b = (a + 60 + (h % 90)) % 360;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span
        className="block h-full w-full rounded-full"
        style={{ background: `radial-gradient(circle at 30% 30%, hsl(${a} 80% 70%), hsl(${b} 70% 45%))` }}
      />
      {rank && rank <= 3 && (
        <span
          className="num absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-black ring-2 ring-bg"
          style={{ background: MEDAL[rank] }}
        >
          {rank}
        </span>
      )}
    </span>
  );
}
