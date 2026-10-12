// Package solana is a small Solana JSON-RPC connector: the three calls the verifier needs,
// with request timeouts and retries on rate limits and server errors.
package solana

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"
)

// MaxSignaturesPerCall is the getSignatureStatuses limit enforced by Solana RPC nodes.
const MaxSignaturesPerCall = 256

// Client talks to one Solana RPC endpoint.
type Client struct {
	url  string
	http *http.Client
}

// New returns a client for the given RPC URL.
func New(url string) *Client {
	return &Client{url: url, http: &http.Client{Timeout: 20 * time.Second}}
}

// FromEnv picks the endpoint: SOLANA_RPC_URL, else Helius via HELIUS_API_KEY, else the public mainnet RPC.
func FromEnv() *Client {
	if u := os.Getenv("SOLANA_RPC_URL"); u != "" {
		return New(u)
	}
	if k := os.Getenv("HELIUS_API_KEY"); k != "" {
		return New("https://mainnet.helius-rpc.com/?api-key=" + k)
	}
	return New("https://api.mainnet-beta.solana.com")
}

type rpcRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      int    `json:"id"`
	Method  string `json:"method"`
	Params  []any  `json:"params"`
}

type rpcResponse struct {
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// ErrRetryable marks failures worth retrying (rate limits, 5xx, transport errors).
var ErrRetryable = errors.New("retryable rpc error")

func (c *Client) call(ctx context.Context, method string, params []any, out any) error {
	body, err := json.Marshal(rpcRequest{JSONRPC: "2.0", ID: 1, Method: method, Params: params})
	if err != nil {
		return err
	}
	var last error
	for attempt := 0; attempt < 4; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Duration(1<<attempt) * 500 * time.Millisecond):
			}
		}
		last = c.do(ctx, method, body, out)
		if last == nil || !errors.Is(last, ErrRetryable) {
			return last
		}
	}
	return last
}

func (c *Client) do(ctx context.Context, method string, body []byte, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("%s: %w: %v", method, ErrRetryable, err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500 {
		return fmt.Errorf("%s: %w: http %d", method, ErrRetryable, res.StatusCode)
	}
	var r rpcResponse
	if err := json.NewDecoder(res.Body).Decode(&r); err != nil {
		return fmt.Errorf("%s: decode: %w", method, err)
	}
	if r.Error != nil {
		return fmt.Errorf("%s: rpc error %d: %s", method, r.Error.Code, r.Error.Message)
	}
	return json.Unmarshal(r.Result, out)
}

// Slot returns the latest finalized slot (used as a health check).
func (c *Client) Slot(ctx context.Context) (uint64, error) {
	var slot uint64
	err := c.call(ctx, "getSlot", []any{map[string]string{"commitment": "finalized"}}, &slot)
	return slot, err
}

// SignatureStatus is one entry of getSignatureStatuses; nil means the signature is unknown.
type SignatureStatus struct {
	Slot               uint64 `json:"slot"`
	Err                any    `json:"err"`
	ConfirmationStatus string `json:"confirmationStatus"`
}

// SignatureStatuses looks up to MaxSignaturesPerCall signatures, searching full history.
func (c *Client) SignatureStatuses(ctx context.Context, signatures []string) ([]*SignatureStatus, error) {
	if len(signatures) > MaxSignaturesPerCall {
		return nil, fmt.Errorf("getSignatureStatuses: %d signatures, max %d", len(signatures), MaxSignaturesPerCall)
	}
	var out struct {
		Value []*SignatureStatus `json:"value"`
	}
	err := c.call(ctx, "getSignatureStatuses", []any{signatures, map[string]bool{"searchTransactionHistory": true}}, &out)
	return out.Value, err
}

// Transaction is the part of getTransaction (jsonParsed) the verifier reports.
type Transaction struct {
	Slot      uint64 `json:"slot"`
	BlockTime *int64 `json:"blockTime"`
	Meta      *struct {
		Err any    `json:"err"`
		Fee uint64 `json:"fee"`
	} `json:"meta"`
	Transaction struct {
		Message struct {
			AccountKeys []struct {
				Pubkey string `json:"pubkey"`
				Signer bool   `json:"signer"`
			} `json:"accountKeys"`
			Instructions []struct {
				ProgramID string `json:"programId"`
			} `json:"instructions"`
		} `json:"message"`
	} `json:"transaction"`
}

// Transaction fetches one transaction; it returns (nil, nil) when the cluster does not know it.
func (c *Client) Transaction(ctx context.Context, signature string) (*Transaction, error) {
	var tx *Transaction
	err := c.call(ctx, "getTransaction", []any{signature, map[string]any{"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0}}, &tx)
	return tx, err
}
