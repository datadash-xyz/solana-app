// Command worker runs the solana-verifier Temporal worker.
package main

import (
	"context"
	"log"

	"go.temporal.io/sdk/worker"

	"github.com/datadash-xyz/solana-hyperliquid-integration/services/solana-verifier/internal/solana"
	"github.com/datadash-xyz/solana-hyperliquid-integration/services/solana-verifier/internal/temporalx"
	"github.com/datadash-xyz/solana-hyperliquid-integration/services/solana-verifier/internal/verifier"
)

func main() {
	rpc := solana.FromEnv()
	slot, err := rpc.Slot(context.Background())
	if err != nil {
		log.Fatalf("solana rpc unreachable: %v", err)
	}
	log.Printf("solana rpc ok, finalized slot %d", slot)

	c, err := temporalx.Dial()
	if err != nil {
		log.Fatalf("temporal: %v", err)
	}
	defer c.Close()

	w := worker.New(c, verifier.TaskQueue, worker.Options{MaxConcurrentActivityExecutionSize: 8})
	w.RegisterWorkflow(verifier.VerifySignaturesWorkflow)
	w.RegisterWorkflow(verifier.TransactionProofWorkflow)
	w.RegisterActivity(&verifier.Activities{RPC: rpc})

	log.Printf("worker polling task queue %q", verifier.TaskQueue)
	if err := w.Run(worker.InterruptCh()); err != nil {
		log.Fatal(err)
	}
}
