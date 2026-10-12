// Package verifier confirms prediction-market trades on Solana as Temporal workflows.
package verifier

import (
	"context"
	"fmt"

	"github.com/datadash-xyz/solana-app/services/solana-verifier/internal/solana"
)

// Result is the on-chain status of one transaction signature.
type Result struct {
	Signature string `json:"signature"`
	// OK means the transaction is confirmed or finalized and did not fail on-chain.
	OK     bool   `json:"ok"`
	Found  bool   `json:"found"`
	Slot   uint64 `json:"slot,omitempty"`
	Status string `json:"status,omitempty"`
	Failed bool   `json:"failed,omitempty"` // landed but returned an error
}

// Proof is the detail shown when a single trade is checked: who signed it and which programs ran.
type Proof struct {
	Signature   string   `json:"signature"`
	Found       bool     `json:"found"`
	OK          bool     `json:"ok"`
	Slot        uint64   `json:"slot,omitempty"`
	BlockTime   *int64   `json:"blockTime,omitempty"`
	FeeLamports uint64   `json:"feeLamports,omitempty"`
	Signers     []string `json:"signers,omitempty"`
	Programs    []string `json:"programs,omitempty"`
}

// Activities holds the connector the activities call. Register a pointer to it with the worker.
type Activities struct {
	RPC *solana.Client
}

// Health returns the latest finalized slot, proving the RPC endpoint is reachable.
func (a *Activities) Health(ctx context.Context) (uint64, error) {
	return a.RPC.Slot(ctx)
}

// VerifyBatch checks up to solana.MaxSignaturesPerCall signatures in one RPC call.
func (a *Activities) VerifyBatch(ctx context.Context, signatures []string) ([]Result, error) {
	statuses, err := a.RPC.SignatureStatuses(ctx, signatures)
	if err != nil {
		return nil, err
	}
	if len(statuses) != len(signatures) {
		return nil, fmt.Errorf("rpc returned %d statuses for %d signatures", len(statuses), len(signatures))
	}
	out := make([]Result, len(signatures))
	for i, s := range statuses {
		out[i] = toResult(signatures[i], s)
	}
	return out, nil
}

func toResult(sig string, s *solana.SignatureStatus) Result {
	if s == nil {
		return Result{Signature: sig}
	}
	confirmed := s.ConfirmationStatus == "confirmed" || s.ConfirmationStatus == "finalized"
	return Result{
		Signature: sig,
		Found:     true,
		Slot:      s.Slot,
		Status:    s.ConfirmationStatus,
		Failed:    s.Err != nil,
		OK:        confirmed && s.Err == nil,
	}
}

// TransactionProof fetches one transaction's slot, time, fee, signers and invoked programs.
func (a *Activities) TransactionProof(ctx context.Context, signature string) (*Proof, error) {
	tx, err := a.RPC.Transaction(ctx, signature)
	if err != nil {
		return nil, err
	}
	p := &Proof{Signature: signature}
	if tx == nil {
		return p, nil
	}
	p.Found, p.Slot, p.BlockTime = true, tx.Slot, tx.BlockTime
	if tx.Meta != nil {
		p.OK, p.FeeLamports = tx.Meta.Err == nil, tx.Meta.Fee
	}
	for _, k := range tx.Transaction.Message.AccountKeys {
		if k.Signer {
			p.Signers = append(p.Signers, k.Pubkey)
		}
	}
	seen := map[string]bool{}
	for _, ix := range tx.Transaction.Message.Instructions {
		if !seen[ix.ProgramID] {
			seen[ix.ProgramID] = true
			p.Programs = append(p.Programs, ix.ProgramID)
		}
	}
	return p, nil
}
