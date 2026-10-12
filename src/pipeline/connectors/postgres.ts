// Sink connector: Postgres (Neon). Owns the queries the pipeline needs beyond plain upserts:
// picking work, recording verification results and refreshing derived views.
import { sql } from "../../lib/db";
import { probe, type Connector } from "./types";

export class PostgresConnector implements Connector {
  readonly name = "postgres";
  readonly sql = sql;

  health() {
    return probe(this.name, async () => {
      const [r] = await sql`select count(*)::int as wallets from wallets`;
      return `wallets=${r.wallets}`;
    });
  }

  /** Wallets never indexed or older than `staleHours`, never-indexed first, then by PnL. */
  async staleWallets(limit: number, staleHours: number, exclude: string[] = []) {
    const rows = await sql`select w.owner from wallets w left join profiles p using (owner)
      where (w.history_at is null or w.history_at < now() - make_interval(hours => ${staleHours}))
        and ${exclude.length ? sql`w.owner not in ${sql(exclude)}` : sql`true`}
      order by w.history_at nulls first, p.realized_pnl_usd desc nulls last
      limit ${limit}`;
    return rows.map((r) => r.owner as string);
  }

  async pendingSignatures(limit: number) {
    const rows = await sql`select distinct signature from history
      where signature is not null and verified_at is null
        and event_type in ('order_filled', 'payout_claimed', 'position_lost')
      limit ${limit}`;
    return rows.map((r) => r.signature as string);
  }

  /** Neon occasionally resets a connection mid-run; retry the write rather than losing the batch. */
  async markVerified(results: { signature: string; ok: boolean }[]) {
    for (let attempt = 0; ; attempt++) {
      try {
        await sql`update history h set verified_at = now(), verified_ok = v.ok::boolean
          from (values ${sql(results.map((r) => [r.signature, String(r.ok)]))}) as v(signature, ok)
          where h.signature = v.signature`;
        return;
      } catch (e) {
        if (attempt >= 3) throw e;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  async missingEventIds(limit: number) {
    const rows = await sql`select distinct event_id from (select event_id from history union select event_id from positions) x
      where event_id is not null and not exists (select 1 from events e where e.event_id = x.event_id) limit ${limit}`;
    return rows.map((r) => r.event_id as string);
  }

  async refreshPositionStats() {
    await sql`refresh materialized view concurrently position_stats`;
    const [{ n }] = await sql`select count(*)::int as n from position_stats`;
    return n as number;
  }
}
