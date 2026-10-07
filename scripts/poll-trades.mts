// Polls Jupiter's global trade feed (latest 20 trades) and keeps every trade we see.
// New traders are added to the wallet universe. Usage: tsx scripts/poll-trades.mts [--every 15] [--once]
import "dotenv/config";
import { sql, ts } from "../src/lib/db";
import { jup, usd, type Trade } from "../src/lib/jupiter";

const i = process.argv.indexOf("--every");
const every = (i > -1 ? Number(process.argv[i + 1]) : 15) * 1000;
const once = process.argv.includes("--once");

async function poll() {
  const { data } = await jup<{ data: Trade[] }>("/trades");
  if (!data.length) return 0;
  const rows = data.map((t) => ({
    id: t.id, owner: t.ownerPubkey, market_id: t.marketId, event_id: t.eventId, action: t.action, side: t.side,
    amount_usd: usd(t.amountUsd), price: usd(t.priceUsd), ts: ts(t.timestamp), event_title: t.eventTitle, market_title: t.marketTitle,
  }));
  const ins = await sql`insert into trades ${sql(rows)} on conflict (id) do nothing returning id`;
  await sql`insert into wallets ${sql([...new Set(rows.map((r) => r.owner))].map((owner) => ({ owner, source: "trades" })))}
    on conflict (owner) do nothing`;
  return ins.length;
}

do {
  try {
    const n = await poll();
    if (n) console.log(`${new Date().toISOString()} +${n} trades`);
  } catch (e) {
    console.error((e as Error).message);
  }
  if (!once) await new Promise((r) => setTimeout(r, every));
} while (!once);
await sql.end();
