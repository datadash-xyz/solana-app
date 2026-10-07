// Thin client for Jupiter's Prediction API (https://developers.jup.ag/docs/prediction).
// All USD values from the API are micro-USD strings; use `usd()` to convert.

const BASE = "https://api.jup.ag/prediction/v1";
const KEY = process.env.JUPITER_API_KEY || "";
// Jupiter limits requests per organisation: keyless 0.5 RPS, free key 1 RPS, paid plans more.
// Set JUPITER_RPS to your plan's rate; every process sharing the key shares this budget.
const RPS = Number(process.env.JUPITER_RPS) || (KEY ? 1 : 0.5);
const MIN_INTERVAL_MS = Math.ceil(1000 / RPS) + 20;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Reserves the next request slot synchronously, so concurrent callers queue instead of bursting.
let nextSlot = 0;
async function takeSlot() {
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + MIN_INTERVAL_MS;
  if (at > now) await sleep(at - now);
}

export const usd = (micro: string | number | null | undefined) =>
  micro === null || micro === undefined || micro === "" ? null : Number(micro) / 1e6;

export async function jup<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

  for (let attempt = 0; ; attempt++) {
    await takeSlot();
    // A stalled connection would otherwise hang the caller forever; time out and retry instead.
    let res: Response;
    try {
      res = await fetch(url, { headers: KEY ? { "x-api-key": KEY } : {}, signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      if (attempt < 6) continue;
      throw e;
    }
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      // On 429 Jupiter says when the window resets; wait until then (capped) and push the queue back too.
      const reset = Number(res.headers.get("x-ratelimit-reset")) * 1000;
      const wait = res.status === 429 && reset > Date.now() ? Math.min(60_000, reset - Date.now() + 250) : Math.min(30_000, 1000 * 2 ** attempt);
      nextSlot = Math.max(nextSlot, Date.now() + wait);
      if (process.env.JUP_DEBUG) console.error(`[jup] ${res.status} ${url.pathname} wait ${wait}ms`, res.headers.get("x-ratelimit-current"), res.headers.get("x-ratelimit-remaining"));
      await sleep(wait);
      continue;
    }
    throw new Error(`Jupiter ${res.status} ${url.pathname}${url.search}: ${(await res.text()).slice(0, 200)}`);
  }
}

type Page<T> = { data: T[]; pagination?: { start: number; end: number; total?: number; hasNext: boolean } };

// Walks a start/end paginated endpoint until hasNext is false (or `max` items).
// `onPage` lets long crawls save as they go instead of holding everything in memory.
export async function jupAll<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  pageSize = 100,
  max = Infinity,
  onPage?: (items: T[], fetched: number) => Promise<void>,
): Promise<T[]> {
  const out: T[] = [];
  let start = 0;
  while (out.length < max) {
    const page = await jup<Page<T>>(path, { ...params, start, end: start + pageSize });
    out.push(...page.data);
    if (onPage) await onPage(page.data, out.length);
    // /history keeps reporting hasNext with empty pages once it runs out, so an empty page ends the walk.
    if (!page.pagination?.hasNext || page.data.length === 0) break;
    // Some endpoints (e.g. /history) return short pages; `pagination.end` is where the next page starts.
    const next = page.pagination.end;
    start = next > start ? next : start + pageSize;
  }
  return out;
}

// ---- Types (only the fields we use) ----

export type Period = "all_time" | "weekly" | "monthly";
export type Metric = "pnl" | "volume" | "win_rate";

export type LeaderboardRow = {
  ownerPubkey: string;
  realizedPnlUsd: string;
  totalVolumeUsd: string;
  predictionsCount: number;
  correctPredictions: number;
  wrongPredictions: number;
  winRatePct: string;
};
export type Leaderboard = {
  data: LeaderboardRow[];
  summary: Record<Period, { totalVolumeUsd: string; predictionsCount: number }>;
};

export type Market = {
  provider: string;
  marketId: string;
  status: string;
  result: string | null;
  title: string;
  closeTime: number | null;
  pricing?: { buyYesPriceUsd: number | null; buyNoPriceUsd: number | null; sellYesPriceUsd: number | null; sellNoPriceUsd: number | null; volume: number | null };
};
export type JEvent = {
  eventId: string;
  isActive: boolean;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  metadata: { title: string; slug?: string; imageUrl?: string; closeTime?: string; series?: string };
  volumeUsd: string | null;
  markets?: Market[];
};

export type Profile = {
  ownerPubkey: string;
  realizedPnlUsd: string;
  totalVolumeUsd: string;
  predictionsCount: string;
  correctPredictions: string;
  wrongPredictions: string;
  totalPositionsValueUsd: string;
};

export type Position = {
  pubkey: string;
  ownerPubkey: string;
  marketId: string;
  eventId: string | null;
  isYes: boolean;
  contractsDecimal: string;
  totalCostUsd: string;
  valueUsd: string | null;
  avgPriceUsd: string;
  markPriceUsd: string | null;
  pnlUsd: string | null;
  realizedPnlUsd: number | null;
  claimed: boolean;
  openedAt: number;
  updatedAt: number;
  eventMetadata?: { title?: string } | null;
};

export type HistoryItem = {
  id: number;
  eventType: string;
  signature: string | null;
  slot: string | null;
  timestamp: number;
  positionPubkey: string | null;
  marketId: string | null;
  eventId: string | null;
  ownerPubkey: string;
  isBuy: boolean | null;
  isYes: boolean | null;
  filledContractsDecimal: string | null;
  avgFillPriceUsd: string | null;
  totalCostUsd: string | null;
  feeUsd: string | null;
  realizedPnl: string | null;
  payoutAmountUsd: string | null;
  // History rows carry the event's and market's metadata, so no extra lookups are needed.
  eventMetadata?: {
    eventId?: string; title?: string; imageUrl?: string; closeTime?: number | string;
    category?: string | null; subcategory?: string | null; tags?: string[] | null;
  } | null;
  marketMetadata?: {
    marketId?: string; eventId?: string; provider?: string; title?: string; status?: string; result?: string | null; closeTime?: number | null;
  } | null;
};

export type Trade = {
  id: string;
  ownerPubkey: string;
  marketId: string;
  eventId: string;
  action: string;
  side: string;
  amountUsd: string;
  priceUsd: string;
  timestamp: number;
  eventTitle: string;
  marketTitle: string;
};
