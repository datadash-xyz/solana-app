// Temporal wiring: connections, the worker, and the schedules that keep the data fresh.
// Works with a local dev server (`temporal server start-dev`, the default) or Temporal Cloud
// (set TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE and TEMPORAL_API_KEY).
import path from "node:path";
import { Client, Connection, ScheduleAlreadyRunning, ScheduleOverlapPolicy, type ScheduleOptions } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities";

export const TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE || "datadash-solana";
const address = process.env.TEMPORAL_ADDRESS || "localhost:7233";
export const namespace = process.env.TEMPORAL_NAMESPACE || "default";
const apiKey = process.env.TEMPORAL_API_KEY || undefined;
const cloud = apiKey ? { tls: true, apiKey } : {};

export async function connectClient() {
  return new Client({ connection: await Connection.connect({ address, ...cloud }), namespace });
}

/**
 * One worker runs every workflow and activity. Activity concurrency stays low on purpose:
 * all Jupiter calls in this process share one request-rate budget (see src/lib/jupiter.ts),
 * so more parallelism would only queue behind it.
 */
export async function createWorker(connection?: NativeConnection, ns = namespace) {
  return Worker.create({
    connection: connection ?? (await NativeConnection.connect({ address, ...cloud })),
    namespace: ns,
    taskQueue: TASK_QUEUE,
    workflowsPath: path.resolve(__dirname, "workflows.ts"),
    activities,
    maxConcurrentActivityTaskExecutions: 4,
  });
}

type Schedule = { id: string; every: string; offset?: string; workflowType: string; args: unknown[]; note: string };

// The trade feed is not scheduled: it runs as one long-lived workflow (`pipeline start-trade-feed`).
export const SCHEDULES: Schedule[] = [
  { id: "leaderboards-hourly", every: "1h", workflowType: "leaderboardSync", args: [], note: "Jupiter leaderboards → wallet universe" },
  { id: "events-6h", every: "6h", workflowType: "eventsSync", args: [{}], note: "events, markets and categories" },
  { id: "wallets-6h", every: "6h", offset: "30m", workflowType: "walletBackfill", args: [{ staleHours: 6 }], note: "re-index stale wallets" },
  { id: "verification-hourly", every: "1h", offset: "15m", workflowType: "onchainVerification", args: [{}], note: "confirm new trades on Solana" },
];

/** Creates each schedule, or updates it in place if it already exists. */
export async function upsertSchedules(client: Client) {
  for (const s of SCHEDULES) {
    const opts: ScheduleOptions = {
      scheduleId: s.id,
      spec: { intervals: [{ every: s.every, offset: s.offset }] },
      action: { type: "startWorkflow", workflowType: s.workflowType, args: s.args, taskQueue: TASK_QUEUE, workflowId: `scheduled/${s.id}` },
      policies: { overlap: ScheduleOverlapPolicy.SKIP, catchupWindow: "1 hour" },
      memo: { note: s.note },
    };
    try {
      await client.schedule.create(opts);
      console.log(`created schedule ${s.id} (every ${s.every})`);
    } catch (err) {
      if (!(err instanceof ScheduleAlreadyRunning)) throw err;
      await client.schedule.getHandle(s.id).update((prev) => ({ ...prev, spec: opts.spec, action: opts.action, policies: opts.policies }));
      console.log(`updated schedule ${s.id} (every ${s.every})`);
    }
  }
}
