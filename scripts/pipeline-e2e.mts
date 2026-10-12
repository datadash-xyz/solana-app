// End-to-end test of the Temporal pipeline against the real connectors.
// Starts a throwaway local Temporal server (the SDK downloads the Temporal CLI on first run),
// runs our worker, then executes:
//   1. fullRefresh with small limits (leaderboards → events → 2 wallet batches with
//      continue-as-new → on-chain verification), and
//   2. tradeFeed, queried for progress and stopped with a signal.
// Usage: npm run pipeline:e2e   (writes to the database in .env, like the normal indexer)
import "dotenv/config";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { sql } from "../src/lib/db";
import { createWorker, TASK_QUEUE } from "../src/pipeline/temporal";
import { fullRefresh, stopSignal, tradeFeed, tradeFeedStatsQuery } from "../src/pipeline/workflows";

const env = await TestWorkflowEnvironment.createLocal();
try {
  const worker = await createWorker(env.nativeConnection, env.namespace ?? "default");
  await worker.runUntil(async () => {
    let t = Date.now();
    const refresh = await env.client.workflow.execute(fullRefresh, {
      taskQueue: TASK_QUEUE,
      workflowId: `e2e/full-refresh/${Date.now()}`,
      args: [
        {
          events: { providers: ["bisonfi"], max: 100 },
          wallets: { batchSize: 2, maxBatches: 2, staleHours: 0, concurrency: 2 },
          verification: { batchLimit: 500, maxRounds: 1 },
        },
      ],
    });
    console.log(`fullRefresh finished in ${((Date.now() - t) / 1000).toFixed(0)}s`);
    console.log(JSON.stringify(refresh, null, 2));

    t = Date.now();
    const feed = await env.client.workflow.start(tradeFeed, {
      taskQueue: TASK_QUEUE,
      workflowId: `e2e/trade-feed/${Date.now()}`,
      args: [{ everySeconds: 3 }],
    });
    await new Promise((r) => setTimeout(r, 8000));
    console.log("tradeFeed stats (query):", await feed.query(tradeFeedStatsQuery));
    await feed.signal(stopSignal);
    console.log("tradeFeed result after stop signal:", await feed.result(), `${((Date.now() - t) / 1000).toFixed(0)}s`);
  });
} finally {
  await env.teardown();
  await sql.end();
}
