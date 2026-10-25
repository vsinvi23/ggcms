package llm

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func testReq() Request {
	return Request{
		Model:     "claude-sonnet-5-5",
		MaxTokens: 100,
		Effort:    "low",
		System:    []Block{{Text: "rules", Cache: true}},
		Messages:  []Message{{Role: "user", Blocks: []Block{{Text: "hi"}}}},
	}
}

func TestCompleteBuildsRequestAndParsesUsage(t *testing.T) {
	var seen apiRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "sk-test" || r.Header.Get("anthropic-version") != anthropicVersion || r.URL.Path != "/v1/messages" {
			t.Errorf("bad headers/path: %v %s", r.Header, r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&seen)
		_, _ = w.Write([]byte(`{"model":"claude-sonnet-5-5","stop_reason":"end_turn","content":[{"type":"thinking","text":"x"},{"type":"text","text":"hello"}],"usage":{"input_tokens":11,"output_tokens":7,"cache_read_input_tokens":5,"cache_creation_input_tokens":3}}`))
	}))
	defer srv.Close()

	a := NewAnthropic(AnthropicConfig{APIKey: "sk-test", BaseURL: srv.URL})
	resp, err := a.Complete(context.Background(), testReq())
	if err != nil {
		t.Fatal(err)
	}
	if resp.Text != "hello" || resp.InputTokens != 11 || resp.OutputTokens != 7 || resp.CacheReadTokens != 5 || resp.CacheWriteTokens != 3 {
		t.Fatalf("response: %+v", resp)
	}
	if seen.System[0].CacheControl["type"] != "ephemeral" || seen.OutputConfig["effort"] != "low" || seen.Messages[0].Content[0].Text != "hi" {
		t.Fatalf("request body: %+v", seen)
	}
}

func TestRetriesTransientThenSucceeds(t *testing.T) {
	var n int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&n, 1) < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte(`{"content":[{"type":"text","text":"ok"}],"usage":{}}`))
	}))
	defer srv.Close()
	a := NewAnthropic(AnthropicConfig{APIKey: "k", BaseURL: srv.URL, MaxRetries: 2, Backoff: time.Millisecond})
	if resp, err := a.Complete(context.Background(), testReq()); err != nil || resp.Text != "ok" || n != 3 {
		t.Fatalf("retry: %v %v calls=%d", resp, err, n)
	}
}

func TestNoRetryOnClientErrorAndKeyNotLeaked(t *testing.T) {
	var n int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&n, 1)
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"echo sk-secret-key"}}`))
	}))
	defer srv.Close()
	a := NewAnthropic(AnthropicConfig{APIKey: "sk-secret-key", BaseURL: srv.URL, MaxRetries: 3, Backoff: time.Millisecond})
	_, err := a.Complete(context.Background(), testReq())
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Status != 400 || apiErr.Retryable || n != 1 {
		t.Fatalf("want single non-retryable 400, got %v calls=%d", err, n)
	}
	if strings.Contains(err.Error(), "sk-secret-key") {
		t.Fatal("errors must never carry the API key or upstream bodies")
	}
}

func TestRetryAfterHonouredAndExhausted(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("retry-after", "0")
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()
	a := NewAnthropic(AnthropicConfig{APIKey: "k", BaseURL: srv.URL, MaxRetries: 1, Backoff: time.Millisecond})
	_, err := a.Complete(context.Background(), testReq())
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Status != 429 {
		t.Fatalf("want 429 after retries, got %v", err)
	}
}

func TestNotConfigured(t *testing.T) {
	a := NewAnthropic(AnthropicConfig{})
	if a.Available() {
		t.Fatal("empty key must be unavailable")
	}
	if _, err := a.Complete(context.Background(), testReq()); !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("want ErrNotConfigured, got %v", err)
	}
}

func TestTimeoutIsRetryableNetworkError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(200 * time.Millisecond)
	}))
	defer srv.Close()
	a := NewAnthropic(AnthropicConfig{APIKey: "k", BaseURL: srv.URL, Timeout: 20 * time.Millisecond, MaxRetries: 0})
	_, err := a.Complete(context.Background(), testReq())
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Kind != "network" {
		t.Fatalf("want network error, got %v", err)
	}
}
