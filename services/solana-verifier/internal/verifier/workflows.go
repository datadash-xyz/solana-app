package verifier

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/datadash-xyz/solana-hyperliquid-integration/services/solana-verifier/internal/solana"
)

// TaskQueue is the queue the worker polls.
const TaskQueue = "solana-verifier"

// VerifyInput configures VerifySignaturesWorkflow.
type VerifyInput struct {
	Signatures []string `json:"signatures"`
	// BatchSize signatures per RPC call (1–256, default 256).
	BatchSize int `json:"batchSize,omitempty"`
	// Parallelism is how many batches run at once (default 4).
	Parallelism int `json:"parallelism,omitempty"`
}

// Report summarises a verification run.
type Report struct {
	Checked   int      `json:"checked"`
	Confirmed int      `json:"confirmed"`
	NotFound  int      `json:"notFound"`
	Failed    int      `json:"failed"` // landed on-chain with an error
	Batches   int      `json:"batches"`
	Results   []Result `json:"results"`
}

var activityOptions = workflow.ActivityOptions{
	StartToCloseTimeout: time.Minute,
	RetryPolicy: &temporal.RetryPolicy{
		InitialInterval:    2 * time.Second,
		BackoffCoefficient: 2,
		MaximumInterval:    30 * time.Second,
		MaximumAttempts:    5,
	},
}

// VerifySignaturesWorkflow confirms a list of transaction signatures on Solana. Signatures are
// split into RPC-sized batches; each batch is one activity, retried on its own, with at most
// `Parallelism` in flight. Results keep the input order.
func VerifySignaturesWorkflow(ctx workflow.Context, in VerifyInput) (Report, error) {
	ctx = workflow.WithActivityOptions(ctx, activityOptions)
	size := in.BatchSize
	if size <= 0 || size > solana.MaxSignaturesPerCall {
		size = solana.MaxSignaturesPerCall
	}
	parallel := in.Parallelism
	if parallel <= 0 {
		parallel = 4
	}

	var batches [][]string
	for i := 0; i < len(in.Signatures); i += size {
		batches = append(batches, in.Signatures[i:min(i+size, len(in.Signatures))])
	}

	var a *Activities // nil receiver: only used to name the activity method
	results := make([][]Result, len(batches))
	for start := 0; start < len(batches); start += parallel {
		end := min(start+parallel, len(batches))
		futures := make([]workflow.Future, 0, end-start)
		for _, b := range batches[start:end] {
			futures = append(futures, workflow.ExecuteActivity(ctx, a.VerifyBatch, b))
		}
		for i, f := range futures {
			if err := f.Get(ctx, &results[start+i]); err != nil {
				return Report{}, err
			}
		}
	}

	report := Report{Batches: len(batches)}
	for _, rs := range results {
		for _, r := range rs {
			report.Checked++
			switch {
			case r.OK:
				report.Confirmed++
			case !r.Found:
				report.NotFound++
			case r.Failed:
				report.Failed++
			}
			report.Results = append(report.Results, r)
		}
	}
	workflow.GetLogger(ctx).Info("verification done", "checked", report.Checked, "confirmed", report.Confirmed)
	return report, nil
}

// TransactionProofWorkflow returns the on-chain detail for one trade.
func TransactionProofWorkflow(ctx workflow.Context, signature string) (*Proof, error) {
	ctx = workflow.WithActivityOptions(ctx, activityOptions)
	var a *Activities
	var p *Proof
	err := workflow.ExecuteActivity(ctx, a.TransactionProof, signature).Get(ctx, &p)
	return p, err
}
