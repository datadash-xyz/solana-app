// Command verify confirms Solana transaction signatures, through Temporal or directly.
//
//	verify [-direct] [-proof] [-batch 256] [-parallel 4] SIG [SIG...]
//	cat signatures.txt | verify -direct
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"go.temporal.io/sdk/client"

	"github.com/datadash-xyz/solana-hyperliquid-integration/services/solana-verifier/internal/solana"
	"github.com/datadash-xyz/solana-hyperliquid-integration/services/solana-verifier/internal/temporalx"
	"github.com/datadash-xyz/solana-hyperliquid-integration/services/solana-verifier/internal/verifier"
)

func main() {
	direct := flag.Bool("direct", false, "call Solana RPC directly instead of running a Temporal workflow")
	proof := flag.Bool("proof", false, "fetch full transaction detail for the first signature")
	batch := flag.Int("batch", solana.MaxSignaturesPerCall, "signatures per RPC call")
	parallel := flag.Int("parallel", 4, "batches in flight")
	flag.Parse()

	sigs := flag.Args()
	if len(sigs) == 0 {
		sc := bufio.NewScanner(os.Stdin)
		for sc.Scan() {
			if s := strings.TrimSpace(sc.Text()); s != "" {
				sigs = append(sigs, s)
			}
		}
	}
	if len(sigs) == 0 {
		log.Fatal("no signatures given (pass as arguments or one per line on stdin)")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	var out any
	var err error
	switch {
	case *direct && *proof:
		out, err = (&verifier.Activities{RPC: solana.FromEnv()}).TransactionProof(ctx, sigs[0])
	case *direct:
		out, err = verifyDirect(ctx, sigs, *batch)
	default:
		out, err = viaTemporal(ctx, sigs, *proof, *batch, *parallel)
	}
	if err != nil {
		log.Fatal(err)
	}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(out)
}

func verifyDirect(ctx context.Context, sigs []string, batch int) (verifier.Report, error) {
	a := &verifier.Activities{RPC: solana.FromEnv()}
	var r verifier.Report
	for i := 0; i < len(sigs); i += batch {
		rs, err := a.VerifyBatch(ctx, sigs[i:min(i+batch, len(sigs))])
		if err != nil {
			return r, err
		}
		r.Batches++
		for _, x := range rs {
			r.Checked++
			switch {
			case x.OK:
				r.Confirmed++
			case !x.Found:
				r.NotFound++
			case x.Failed:
				r.Failed++
			}
			r.Results = append(r.Results, x)
		}
	}
	return r, nil
}

func viaTemporal(ctx context.Context, sigs []string, proof bool, batch, parallel int) (any, error) {
	c, err := temporalx.Dial()
	if err != nil {
		return nil, fmt.Errorf("temporal: %w", err)
	}
	defer c.Close()
	opts := client.StartWorkflowOptions{
		ID:        fmt.Sprintf("verify-%d", time.Now().UnixNano()),
		TaskQueue: verifier.TaskQueue,
	}
	if proof {
		var p *verifier.Proof
		run, err := c.ExecuteWorkflow(ctx, opts, verifier.TransactionProofWorkflow, sigs[0])
		if err != nil {
			return nil, err
		}
		err = run.Get(ctx, &p)
		return p, err
	}
	var r verifier.Report
	run, err := c.ExecuteWorkflow(ctx, opts, verifier.VerifySignaturesWorkflow, verifier.VerifyInput{Signatures: sigs, BatchSize: batch, Parallelism: parallel})
	if err != nil {
		return nil, err
	}
	err = run.Get(ctx, &r)
	return r, err
}
