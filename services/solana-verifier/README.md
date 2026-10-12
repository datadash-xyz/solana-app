# solana-verifier

A Go service that confirms prediction-market trades on Solana, run as [Temporal](https://temporal.io) workflows.

Given transaction signatures (for example from a trader's Jupiter Prediction history), it reports whether each one is confirmed on-chain, and can return the full proof for a single trade: slot, block time, fee, signers and the programs it invoked (Jupiter Prediction's program is `3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp`).

It is a standalone Go module with no imports from the web app.

## Layout

```
cmd/worker/            Temporal worker (registers the workflows and activities)
cmd/verify/            CLI: run the workflows through Temporal, or call Solana RPC directly (-direct)
internal/solana/       Solana JSON-RPC connector: getSignatureStatuses, getTransaction, getSlot
internal/verifier/     Temporal activities and workflows
internal/temporalx/    Temporal connection from env (local dev server or Temporal Cloud)
scripts/e2e.sh         End-to-end run on a throwaway local Temporal server
```

## Workflows

| Workflow | Input | What it does |
|---|---|---|
| `VerifySignaturesWorkflow` | `{signatures, batchSize?, parallelism?}` | Splits signatures into RPC-sized batches (max 256), runs one `VerifyBatch` activity per batch with at most `parallelism` in flight, and returns a report (checked / confirmed / not found / failed on-chain) with per-signature results in input order. |
| `TransactionProofWorkflow` | `signature` | Runs `TransactionProof` and returns slot, block time, fee, signers and invoked programs. |

Activities time out after 1 minute and retry up to 5 times with exponential backoff. The RPC connector also retries rate limits (HTTP 429) and server errors itself, but not RPC-level errors such as malformed signatures.

## Run

Requires Go 1.24+ and the [Temporal CLI](https://docs.temporal.io/cli).

```bash
temporal server start-dev                      # local Temporal on 127.0.0.1:7233
export HELIUS_API_KEY=...                      # or SOLANA_RPC_URL=...; defaults to the public mainnet RPC
go run ./cmd/worker                            # keep running
go run ./cmd/verify SIG [SIG...]               # VerifySignaturesWorkflow
go run ./cmd/verify -proof SIG                 # TransactionProofWorkflow
go run ./cmd/verify -direct SIG [SIG...]       # same check without Temporal
```

For Temporal Cloud, set `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE` and `TEMPORAL_API_KEY`.

## Test

```bash
go test ./...                 # RPC connector (fake RPC server: parsing, 429 retry, batch limit) and workflow (Temporal test suite)
./scripts/e2e.sh SIG [SIG...] # throwaway Temporal server + worker + both workflows against live Solana
```

Example end-to-end run (Oct 12, 2026) with two real Jupiter Prediction trades and one well-formed signature that does not exist:

```
== VerifySignaturesWorkflow (batch 1, 2 in parallel)
{ "checked": 3, "confirmed": 2, "notFound": 1, "failed": 0, "batches": 3, ... }
== TransactionProofWorkflow
{ "found": true, "ok": true, "slot": 449866258, "feeLamports": 13222,
  "programs": ["ComputeBudget111111111111111111111111111111", "3ZZuTbwC6aJbvteyVxXUS7gtFYdf7AuXeitx6VyvjvUp"], ... }
== Workflow executions on the dev server
  Completed  verify-…  TransactionProofWorkflow
  Completed  verify-…  VerifySignaturesWorkflow
```

Note: the default Temporal address is `127.0.0.1`, not `localhost`. Where `localhost` resolves to IPv6 first, gRPC can hang against `temporal server start-dev`, which listens on IPv4 only.
