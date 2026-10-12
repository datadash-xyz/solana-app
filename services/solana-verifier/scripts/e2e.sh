#!/usr/bin/env bash
# End-to-end check: starts a throwaway in-memory Temporal dev server, runs the worker, then runs
# VerifySignaturesWorkflow and TransactionProofWorkflow against live Solana RPC.
# Needs the `temporal` CLI and Go. Uses SOLANA_RPC_URL / HELIUS_API_KEY if set (else public RPC).
#   ./scripts/e2e.sh SIG [SIG...]
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -gt 0 ] || { echo "usage: $0 SIG [SIG...]"; exit 1; }

PORT="${PORT:-7245}"
export TEMPORAL_ADDRESS="127.0.0.1:$PORT"
mkdir -p bin
go build -o bin/worker ./cmd/worker
go build -o bin/verify ./cmd/verify

temporal server start-dev --port "$PORT" --headless --log-level error >bin/temporal.log 2>&1 &
SERVER=$!
WORKER=""
trap 'kill $SERVER ${WORKER:-} 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do temporal operator namespace list --address "$TEMPORAL_ADDRESS" >/dev/null 2>&1 && break; sleep 1; done

./bin/worker >bin/worker.log 2>&1 &
WORKER=$!
sleep 3

echo "== VerifySignaturesWorkflow (batch 1, 2 in parallel)"
./bin/verify -batch 1 -parallel 2 "$@"
echo "== TransactionProofWorkflow"
./bin/verify -proof "$1"
echo "== Workflow executions on the dev server"
temporal workflow list --address "$TEMPORAL_ADDRESS"
