// Temporal activities: thin wrappers over the pipeline jobs. Long-running ones heartbeat their
// progress, so a stuck worker is detected (heartbeatTimeout) and the activity retried elsewhere.
import { Context } from "@temporalio/activity";
import type { Provider } from "./connectors/jupiter";
import * as jobs from "./jobs";

const heartbeat = (detail: string) => Context.current().heartbeat(detail);

export async function checkConnectors() {
  return jobs.checkConnectors();
}

export async function syncLeaderboards() {
  return jobs.syncLeaderboards(heartbeat);
}

export async function syncEvents(provider: Provider, max: number) {
  return jobs.syncEvents(provider, max, heartbeat);
}

export async function listWalletsToIndex(limit: number, staleHours: number, exclude: string[]) {
  return jobs.listWalletsToIndex(limit, staleHours, exclude);
}

export async function indexWallet(owner: string) {
  return jobs.indexWallet(owner, heartbeat);
}

export async function backfillMissingEvents(limit: number) {
  return jobs.backfillMissingEvents(limit, heartbeat);
}

export async function pollTrades() {
  return jobs.pollTrades();
}

export async function verifyPending(limit: number) {
  return jobs.verifyPending(limit, heartbeat);
}

export async function refreshViews() {
  return jobs.refreshViews();
}
