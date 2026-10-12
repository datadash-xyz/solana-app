package solana

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

func TestSignatureStatusesParsesAndRetries(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusTooManyRequests) // first call is rate limited
			return
		}
		var req rpcRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		if req.Method != "getSignatureStatuses" {
			t.Errorf("method = %s", req.Method)
		}
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"value":[
			{"slot":10,"err":null,"confirmationStatus":"finalized"},
			null,
			{"slot":12,"err":{"InstructionError":[0,"Custom"]},"confirmationStatus":"finalized"}]}}`))
	}))
	defer srv.Close()

	got, err := New(srv.URL).SignatureStatuses(context.Background(), []string{"a", "b", "c"})
	if err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatalf("expected a retry after 429, got %d calls", calls.Load())
	}
	if len(got) != 3 || got[0].Slot != 10 || got[1] != nil || got[2].Err == nil {
		t.Fatalf("unexpected statuses: %+v", got)
	}
}

func TestSignatureStatusesRejectsOversizedBatch(t *testing.T) {
	if _, err := New("http://unused").SignatureStatuses(context.Background(), make([]string, MaxSignaturesPerCall+1)); err == nil {
		t.Fatal("expected an error for more than 256 signatures")
	}
}

func TestRPCErrorIsNotRetried(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"error":{"code":-32602,"message":"Invalid param"}}`))
	}))
	defer srv.Close()
	if _, err := New(srv.URL).Slot(context.Background()); err == nil {
		t.Fatal("expected rpc error")
	}
	if calls.Load() != 1 {
		t.Fatalf("rpc errors should not be retried, got %d calls", calls.Load())
	}
}
