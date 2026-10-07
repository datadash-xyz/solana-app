// Snapshots Jupiter's leaderboards (every period x metric, top 100 each) and the
// platform totals, and adds every ranked wallet to our wallet universe.
import "dotenv/config";
import { sql } from "../src/lib/db";
import { jup, usd, type Leaderboard, type Metric, type Period } from "../src/lib/jupiter";

const periods: Period[] = ["all_time", "monthly", "weekly"];
const metrics: Metric[] = ["pnl", "volume", "win_rate"];

let summaryDone = false;
for (const period of periods) {
  for (const metric of metrics) {
    const lb = await jup<Leaderboard>("/leaderboards", { period, metric, limit: 100 });
    const rows = lb.data.map((r, i) => ({
      period, metric, rank: i + 1, owner: r.ownerPubkey,
      realized_pnl_usd: usd(r.realizedPnlUsd), volume_usd: usd(r.totalVolumeUsd),
      predictions: r.predictionsCount, correct: r.correctPredictions, wrong: r.wrongPredictions,
      win_rate: Number(r.winRatePct),
    }));
    await sql`delete from leaderboard where period = ${period} and metric = ${metric}`;
    if (rows.length) await sql`insert into leaderboard ${sql(rows)}`;
    if (rows.length)
      await sql`insert into wallets ${sql(rows.map((r) => ({ owner: r.owner, source: "leaderboard" })))} on conflict (owner) do nothing`;

    if (!summaryDone) {
      for (const [p, s] of Object.entries(lb.summary)) {
        await sql`insert into platform_summary (period, volume_usd, predictions)
          values (${p}, ${usd(s.totalVolumeUsd)}, ${s.predictionsCount})
          on conflict (period) do update set volume_usd = excluded.volume_usd, predictions = excluded.predictions, fetched_at = now()`;
      }
      summaryDone = true;
    }
    console.log(`${period}/${metric}: ${rows.length} wallets`);
  }
}
const [{ n }] = await sql`select count(*)::int as n from wallets`;
console.log(`wallet universe: ${n}`);
await sql.end();
