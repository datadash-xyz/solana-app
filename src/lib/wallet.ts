// Fetches one wallet's profile, positions and history from Jupiter and stores them.
import { sql, ts } from "./db";
import { jup, jupAll, usd, type HistoryItem, type JEvent, type Position, type Profile } from "./jupiter";
import { saveEvents } from "./save";

const num = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? null : Number(s));

export async function indexWallet(owner: string) {
  const p = await jup<Profile>(`/profiles/${owner}`);
  await sql`insert into profiles ${sql({
    owner,
    realized_pnl_usd: usd(p.realizedPnlUsd), volume_usd: usd(p.totalVolumeUsd),
    predictions: Number(p.predictionsCount), correct: Number(p.correctPredictions), wrong: Number(p.wrongPredictions),
    positions_value_usd: usd(p.totalPositionsValueUsd),
  })} on conflict (owner) do update set realized_pnl_usd = excluded.realized_pnl_usd, volume_usd = excluded.volume_usd,
    predictions = excluded.predictions, correct = excluded.correct, wrong = excluded.wrong,
    positions_value_usd = excluded.positions_value_usd, fetched_at = now()`;

  const positions = await jupAll<Position>("/positions", { ownerPubkey: owner });
  const posRows = positions.map((x) => ({
    pubkey: x.pubkey, owner, market_id: x.marketId, event_id: x.eventId, is_yes: x.isYes,
    contracts: num(x.contractsDecimal), cost_usd: usd(x.totalCostUsd), value_usd: usd(x.valueUsd),
    avg_price: usd(x.avgPriceUsd), mark_price: usd(x.markPriceUsd), pnl_usd: usd(x.pnlUsd),
    realized_pnl_usd: usd(x.realizedPnlUsd), claimed: x.claimed, opened_at: ts(x.openedAt), updated_at: ts(x.updatedAt),
  }));
  // Positions endpoint only returns what is currently held; replace the wallet's set.
  await sql.begin(async (tx) => {
    await tx`delete from positions where owner = ${owner}`;
    if (posRows.length) await tx`insert into positions ${tx(posRows)} on conflict (pubkey) do nothing`;
  });

  // Cap very active (bot) wallets; profile totals still come from Jupiter.
  const history = await jupAll<HistoryItem>("/history", { ownerPubkey: owner }, 100, 5000);
  // Pages can overlap when new events arrive mid-crawl, so de-duplicate by id.
  const hRows = [...new Map(history.map((h) => [h.id, h])).values()].map((h) => ({
    id: h.id, owner, event_type: h.eventType, signature: h.signature, slot: num(h.slot), ts: ts(h.timestamp),
    market_id: h.marketId, event_id: h.eventId, position_pubkey: h.positionPubkey, is_buy: h.isBuy, is_yes: h.isYes,
    contracts: num(h.filledContractsDecimal), avg_fill_price: usd(h.avgFillPriceUsd), total_cost_usd: usd(h.totalCostUsd),
    fee_usd: usd(h.feeUsd), realized_pnl_usd: usd(h.realizedPnl), payout_usd: usd(h.payoutAmountUsd),
    title: h.eventMetadata?.title ?? null,
  }));
  for (let i = 0; i < hRows.length; i += 500) {
    await sql`insert into history ${sql(hRows.slice(i, i + 500))} on conflict (id) do update set
      realized_pnl_usd = excluded.realized_pnl_usd, payout_usd = excluded.payout_usd, title = excluded.title`;
  }

  // Fetch metadata (category, title) for events this wallet traded that we haven't stored yet.
  const missing = await sql`select distinct event_id from (
      select event_id from history where owner = ${owner} union select event_id from positions where owner = ${owner}) x
    where event_id is not null and not exists (select 1 from events e where e.event_id = x.event_id)`;
  for (const { event_id } of missing) {
    try {
      await saveEvents([await jup<JEvent>(`/events/${encodeURIComponent(event_id)}`, { includeMarkets: true })]);
    } catch {
      // Some old events are no longer served; they stay under "Other".
    }
  }

  await sql`insert into wallets (owner, source, profiled_at, history_at) values (${owner}, 'manual', now(), now())
    on conflict (owner) do update set profiled_at = now(), history_at = now()`;
  return { positions: posRows.length, history: hRows.length };
}
