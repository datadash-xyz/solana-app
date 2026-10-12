// Source connector: Jupiter Prediction API (Solana prediction markets: Polymarket, Kalshi
// and Jupiter Forecast). Pacing, 429 handling and cursor paging live in src/lib/jupiter.ts.
import { jup, jupAll, type HistoryItem, type JEvent, type Leaderboard, type Metric, type Period, type Position, type Profile, type Trade } from "../../lib/jupiter";
import { probe, type Connector } from "./types";

export type Provider = "polymarket" | "kalshi" | "bisonfi";
type PageHook<T> = (items: T[], fetched: number) => Promise<void>;

export class JupiterPredictionConnector implements Connector {
  readonly name = "jupiter-prediction";

  health() {
    return probe(this.name, async () => {
      const s = await jup<{ trading_active: boolean }>("/trading-status");
      return `trading_active=${s.trading_active}`;
    });
  }

  leaderboard(period: Period, metric: Metric, limit = 100) {
    return jup<Leaderboard>("/leaderboards", { period, metric, limit });
  }

  /** Events with their markets, highest volume first. */
  events(provider: Provider, max: number, onPage?: PageHook<JEvent>) {
    return jupAll<JEvent>("/events", { provider, includeMarkets: true, sortBy: "volume", sortDirection: "desc" }, 100, max, onPage);
  }

  event(eventId: string) {
    return jup<JEvent>(`/events/${encodeURIComponent(eventId)}`, { includeMarkets: true });
  }

  profile(owner: string) {
    return jup<Profile>(`/profiles/${owner}`);
  }

  /** Positions currently held (Jupiter requires an owner; there is no holders-by-market query). */
  positions(owner: string) {
    return jupAll<Position>("/positions", { ownerPubkey: owner });
  }

  /** Full order/fill/payout history, each row with its Solana transaction signature. */
  history(owner: string, max: number, onPage?: PageHook<HistoryItem>) {
    return jupAll<HistoryItem>("/history", { ownerPubkey: owner }, 200, max, onPage);
  }

  /** Global trade feed. Jupiter only returns the latest 20, so callers poll it. */
  async trades() {
    return (await jup<{ data: Trade[] }>("/trades")).data;
  }
}
