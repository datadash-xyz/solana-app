// Temporal workflows for the Datadash on Solana data pipeline.
// Workflow code must be deterministic: it only orchestrates; all I/O happens in activities.
import {
  condition,
  continueAsNew,
  defineQuery,
  defineSignal,
  executeChild,
  log,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";
import type * as activities from "./activities";

// Short calls: one or a few API/DB round trips.
const quick = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: { initialInterval: "5s", backoffCoefficient: 2, maximumInterval: "1 minute", maximumAttempts: 5 },
});

// Long calls: page through Jupiter at the plan's request rate, heartbeating as they go.
const long = proxyActivities<typeof activities>({
  startToCloseTimeout: "45 minutes",
  heartbeatTimeout: "3 minutes",
  retry: { initialInterval: "30s", backoffCoefficient: 2, maximumInterval: "5 minutes", maximumAttempts: 3 },
});

export type Provider = "polymarket" | "kalshi" | "bisonfi";

/** Snapshot Jupiter's leaderboards and grow the wallet universe. */
export async function leaderboardSync() {
  return long.syncLeaderboards();
}

/** Refresh events, markets and categories for each provider. */
export async function eventsSync(input: { providers?: Provider[]; max?: number } = {}) {
  const { providers = ["polymarket", "kalshi", "bisonfi"], max = 3000 } = input;
  const results = [];
  for (const provider of providers) results.push(await long.syncEvents(provider, max));
  return results;
}

export type WalletBackfillInput = {
  batchSize?: number;
  staleHours?: number;
  concurrency?: number;
  maxBatches?: number;
  // Carried across continue-as-new:
  batch?: number;
  totals?: { indexed: number; failed: number; history: number };
  failed?: string[];
};

/**
 * Re-index stale wallets in batches. Each wallet is its own activity (retried independently);
 * `concurrency` lanes share the worker's Jupiter rate limit. After each batch the workflow
 * continues-as-new, keeping its event history small however many wallets there are.
 */
export async function walletBackfill(input: WalletBackfillInput = {}): Promise<{ indexed: number; failed: number; history: number; batches: number; positions: number }> {
  const { batchSize = 50, staleHours = 12, concurrency = 2, maxBatches = 40, batch = 1, failed = [] } = input;
  const totals = { indexed: 0, failed: 0, history: 0, ...input.totals };

  // Wallets that failed every retry in an earlier batch are skipped for the rest of this run.
  const owners = await quick.listWalletsToIndex(batchSize, staleHours, failed);
  let next = 0;
  const lane = async () => {
    while (next < owners.length) {
      const owner = owners[next++];
      try {
        const r = await long.indexWallet(owner);
        totals.indexed++;
        totals.history += r.history;
      } catch (err) {
        totals.failed++;
        failed.push(owner);
        log.warn("wallet failed after retries", { owner, err: String(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, owners.length) }, lane));

  if (owners.length === batchSize && batch < maxBatches) {
    return continueAsNew<typeof walletBackfill>({ ...input, batch: batch + 1, totals, failed });
  }
  await long.backfillMissingEvents(200);
  const { positions } = await quick.refreshViews();
  return { ...totals, batches: batch, positions };
}

/** Confirm every unchecked trade signature on Solana, in rounds of `batchLimit`. */
export async function onchainVerification(input: { batchLimit?: number; maxRounds?: number } = {}) {
  const { batchLimit = 5000, maxRounds = 50 } = input;
  const totals = { checked: 0, confirmed: 0, failed: 0, rounds: 0 };
  for (let round = 0; round < maxRounds; round++) {
    const r = await long.verifyPending(batchLimit);
    totals.checked += r.checked;
    totals.confirmed += r.confirmed;
    totals.failed += r.failed;
    totals.rounds++;
    if (r.checked < batchLimit) break;
  }
  return totals;
}

export const stopSignal = defineSignal("stop");
export const tradeFeedStatsQuery = defineQuery<{ polls: number; inserted: number }>("stats");

/**
 * Long-running poller for Jupiter's global trade feed (it only returns the latest 20 trades).
 * Send the `stop` signal to end it; query `stats` for progress. Continues-as-new every 500 polls.
 */
export async function tradeFeed(input: { everySeconds?: number; maxPolls?: number; polls?: number; inserted?: number } = {}) {
  const { everySeconds = 30, maxPolls = 0 } = input;
  let polls = input.polls ?? 0;
  let inserted = input.inserted ?? 0;
  let stopped = false;
  setHandler(stopSignal, () => void (stopped = true));
  setHandler(tradeFeedStatsQuery, () => ({ polls, inserted }));

  let thisRun = 0;
  while (!stopped) {
    inserted += (await quick.pollTrades()).inserted;
    polls++;
    thisRun++;
    if (maxPolls && polls >= maxPolls) break;
    if (thisRun >= 500) return continueAsNew<typeof tradeFeed>({ everySeconds, maxPolls, polls, inserted });
    // Sleep until the next poll, or wake early on `stop`.
    await condition(() => stopped, `${everySeconds} seconds`);
  }
  return { polls, inserted };
}

export type FullRefreshInput = {
  events?: { providers?: Provider[]; max?: number };
  wallets?: WalletBackfillInput;
  verification?: { batchLimit?: number; maxRounds?: number };
};

/** End-to-end refresh: health check, then each stage as a child workflow. */
export async function fullRefresh(input: FullRefreshInput = {}) {
  const health = await quick.checkConnectors();
  const down = health.filter((h) => !h.ok);
  if (down.length) throw new Error(`connectors down: ${down.map((h) => `${h.connector} (${h.detail})`).join(", ")}`);

  const id = workflowInfo().workflowId;
  const leaderboards = await executeChild(leaderboardSync, { workflowId: `${id}/leaderboards` });
  const events = await executeChild(eventsSync, { workflowId: `${id}/events`, args: [input.events ?? {}] });
  const wallets = await executeChild(walletBackfill, { workflowId: `${id}/wallets`, args: [input.wallets ?? {}] });
  const verification = await executeChild(onchainVerification, { workflowId: `${id}/verification`, args: [input.verification ?? {}] });
  return { health, leaderboards, events, wallets, verification };
}
