// The pipeline's units of work. Each job reads from source connectors and writes through the
// Postgres connector. The same functions back the CLI scripts (scripts/*.mts) and the
// Temporal activities (src/pipeline/activities.ts), so there is one implementation of each step.
import { ts } from "../lib/db";
import { usd, type Metric, type Period } from "../lib/jupiter";
import { saveEvents } from "../lib/save";
import { indexWallet as indexWalletImpl } from "../lib/wallet";
import { connectors } from "./connectors";
import type { Provider } from "./connectors/jupiter";

export type Progress = (detail: string) => void;
const { jupiter, solana, postgres } = connectors;
const sql = postgres.sql;

export async function checkConnectors() {
  return Promise.all([jupiter.health(), solana.health(), postgres.health()]);
}

/** Jupiter's 9 leaderboards (3 periods x 3 metrics, top 100 each) → wallet universe + platform totals. */
export async function syncLeaderboards(progress?: Progress) {
  const periods: Period[] = ["all_time", "monthly", "weekly"];
  const metrics: Metric[] = ["pnl", "volume", "win_rate"];
  let boards = 0;
  for (const period of periods) {
    for (const metric of metrics) {
      const lb = await jupiter.leaderboard(period, metric);
      const rows = lb.data.map((r, i) => ({
        period, metric, rank: i + 1, owner: r.ownerPubkey,
        realized_pnl_usd: usd(r.realizedPnlUsd), volume_usd: usd(r.totalVolumeUsd),
        predictions: r.predictionsCount, correct: r.correctPredictions, wrong: r.wrongPredictions,
        win_rate: Number(r.winRatePct),
      }));
      await sql.begin(async (tx) => {
        await tx`delete from leaderboard where period = ${period} and metric = ${metric}`;
        if (rows.length) await tx`insert into leaderboard ${tx(rows)}`;
      });
      if (rows.length) await sql`insert into wallets ${sql(rows.map((r) => ({ owner: r.owner, source: "leaderboard" })))} on conflict (owner) do nothing`;
      if (boards === 0) {
        for (const [p, s] of Object.entries(lb.summary)) {
          await sql`insert into platform_summary (period, volume_usd, predictions) values (${p}, ${usd(s.totalVolumeUsd)}, ${s.predictionsCount})
            on conflict (period) do update set volume_usd = excluded.volume_usd, predictions = excluded.predictions, fetched_at = now()`;
        }
      }
      boards++;
      progress?.(`${period}/${metric}: ${rows.length}`);
    }
  }
  const [{ n }] = await sql`select count(*)::int as n from wallets`;
  return { boards, wallets: n as number };
}

/** Top events by volume for one provider, with categories and markets. */
export async function syncEvents(provider: Provider, max: number, progress?: Progress) {
  let markets = 0;
  const events = await jupiter.events(provider, max, async (page, fetched) => {
    markets += await saveEvents(page, provider);
    progress?.(`${provider}: ${fetched} events`);
  });
  return { provider, events: events.length, markets };
}

export function listWalletsToIndex(limit: number, staleHours: number, exclude: string[] = []) {
  return postgres.staleWallets(limit, staleHours, exclude);
}

/** Profile, positions and full history (with signatures) for one wallet. */
export function indexWallet(owner: string, progress?: Progress) {
  return indexWalletImpl(owner, { onProgress: progress });
}

/** Metadata for events that positions reference but history did not carry. */
export async function backfillMissingEvents(limit: number, progress?: Progress) {
  const ids = await postgres.missingEventIds(limit);
  let saved = 0;
  for (const id of ids) {
    try {
      await saveEvents([await jupiter.event(id)]);
      saved++;
    } catch {
      // Some old events are no longer served; they stay under "Other".
    }
    progress?.(`events ${saved}/${ids.length}`);
  }
  return { missing: ids.length, saved };
}

/** One poll of the global trade feed; new traders join the wallet universe. */
export async function pollTrades() {
  const data = await jupiter.trades();
  if (!data.length) return { seen: 0, inserted: 0 };
  const rows = data.map((t) => ({
    id: t.id, owner: t.ownerPubkey, market_id: t.marketId, event_id: t.eventId, action: t.action, side: t.side,
    amount_usd: usd(t.amountUsd), price: usd(t.priceUsd), ts: ts(t.timestamp), event_title: t.eventTitle, market_title: t.marketTitle,
  }));
  const inserted = await sql`insert into trades ${sql(rows)} on conflict (id) do nothing returning id`;
  await sql`insert into wallets ${sql([...new Set(rows.map((r) => r.owner))].map((owner) => ({ owner, source: "trades" })))} on conflict (owner) do nothing`;
  return { seen: rows.length, inserted: inserted.length };
}

/** Confirms up to `limit` unchecked trade signatures on Solana. */
export async function verifyPending(limit: number, progress?: Progress) {
  const sigs = await postgres.pendingSignatures(limit);
  let confirmed = 0;
  for (let k = 0; k < sigs.length; k += 256) {
    const batch = sigs.slice(k, k + 256);
    const res = await solana.signatureStatuses(batch);
    const results = batch.map((signature) => ({ signature, ok: res.get(signature)?.ok ?? false }));
    confirmed += results.filter((r) => r.ok).length;
    await postgres.markVerified(results);
    progress?.(`${Math.min(k + 256, sigs.length)}/${sigs.length} checked, ${confirmed} confirmed`);
  }
  return { checked: sigs.length, confirmed, failed: sigs.length - confirmed };
}

/** Rebuilds the leaderboard snapshot (position_stats) from history. */
export async function refreshViews() {
  const t = Date.now();
  const positions = await postgres.refreshPositionStats();
  return { positions, seconds: Math.round((Date.now() - t) / 100) / 10 };
}
