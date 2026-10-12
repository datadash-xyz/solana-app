package verifier

import (
	"context"
	"fmt"
	"testing"

	"go.temporal.io/sdk/testsuite"
)

// The workflow splits signatures into RPC-sized batches and aggregates results in order.
func TestVerifySignaturesWorkflowBatchesAndAggregates(t *testing.T) {
	var s testsuite.WorkflowTestSuite
	env := s.NewTestWorkflowEnvironment()

	var a *Activities
	batchSizes := []int{}
	env.OnActivity(a.VerifyBatch, mockAnything, mockAnything).Return(func(_ context.Context, sigs []string) ([]Result, error) {
		batchSizes = append(batchSizes, len(sigs))
		out := make([]Result, len(sigs))
		for i, sig := range sigs {
			switch {
			case sig == "missing":
				out[i] = Result{Signature: sig}
			case sig == "reverted":
				out[i] = Result{Signature: sig, Found: true, Failed: true, Status: "finalized"}
			default:
				out[i] = Result{Signature: sig, Found: true, OK: true, Status: "finalized"}
			}
		}
		return out, nil
	})

	sigs := []string{}
	for i := 0; i < 7; i++ {
		sigs = append(sigs, fmt.Sprintf("sig%d", i))
	}
	sigs = append(sigs, "missing", "reverted")

	env.ExecuteWorkflow(VerifySignaturesWorkflow, VerifyInput{Signatures: sigs, BatchSize: 4, Parallelism: 2})
	if !env.IsWorkflowCompleted() || env.GetWorkflowError() != nil {
		t.Fatalf("workflow failed: %v", env.GetWorkflowError())
	}
	var r Report
	if err := env.GetWorkflowResult(&r); err != nil {
		t.Fatal(err)
	}
	if r.Batches != 3 || len(batchSizes) != 3 {
		t.Fatalf("expected 3 batches of <=4, got %d (%v)", r.Batches, batchSizes)
	}
	if r.Checked != 9 || r.Confirmed != 7 || r.NotFound != 1 || r.Failed != 1 {
		t.Fatalf("unexpected report: %+v", r)
	}
	if r.Results[7].Signature != "missing" || r.Results[8].Signature != "reverted" {
		t.Fatal("results lost input order")
	}
}

func TestToResult(t *testing.T) {
	if r := toResult("x", nil); r.Found || r.OK {
		t.Fatalf("nil status should be not found: %+v", r)
	}
}
