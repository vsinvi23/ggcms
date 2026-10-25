package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	defaultBaseURL   = "https://api.anthropic.com"
	anthropicVersion = "2023-06-01"
	maxResponseBytes = 4 << 20
)

type AnthropicConfig struct {
	APIKey     string
	BaseURL    string
	Timeout    time.Duration
	MaxRetries int
	Backoff    time.Duration
	HTTPClient *http.Client
}

type Anthropic struct {
	apiKey     string
	baseURL    string
	timeout    time.Duration
	maxRetries int
	backoff    time.Duration
	client     *http.Client
}

func NewAnthropic(cfg AnthropicConfig) *Anthropic {
	a := &Anthropic{
		apiKey:     strings.TrimSpace(cfg.APIKey),
		baseURL:    strings.TrimRight(cfg.BaseURL, "/"),
		timeout:    cfg.Timeout,
		maxRetries: cfg.MaxRetries,
		backoff:    cfg.Backoff,
		client:     cfg.HTTPClient,
	}
	if a.baseURL == "" {
		a.baseURL = defaultBaseURL
	}
	if a.timeout <= 0 {
		a.timeout = 45 * time.Second
	}
	if a.maxRetries < 0 {
		a.maxRetries = 0
	}
	if a.backoff <= 0 {
		a.backoff = 500 * time.Millisecond
	}
	if a.client == nil {
		a.client = &http.Client{}
	}
	return a
}

func (a *Anthropic) Name() string    { return "anthropic" }
func (a *Anthropic) Available() bool { return a.apiKey != "" }

type apiBlock struct {
	Type         string            `json:"type"`
	Text         string            `json:"text"`
	CacheControl map[string]string `json:"cache_control,omitempty"`
}

type apiMessage struct {
	Role    string     `json:"role"`
	Content []apiBlock `json:"content"`
}

type apiRequest struct {
	Model        string            `json:"model"`
	MaxTokens    int               `json:"max_tokens"`
	System       []apiBlock        `json:"system,omitempty"`
	Messages     []apiMessage      `json:"messages"`
	OutputConfig map[string]string `json:"output_config,omitempty"`
}

type apiResponse struct {
	Model      string `json:"model"`
	StopReason string `json:"stop_reason"`
	Content    []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Usage struct {
		InputTokens      int `json:"input_tokens"`
		OutputTokens     int `json:"output_tokens"`
		CacheReadTokens  int `json:"cache_read_input_tokens"`
		CacheWriteTokens int `json:"cache_creation_input_tokens"`
	} `json:"usage"`
}

func toAPIBlocks(blocks []Block) []apiBlock {
	out := make([]apiBlock, 0, len(blocks))
	for _, b := range blocks {
		ab := apiBlock{Type: "text", Text: b.Text}
		if b.Cache {
			ab.CacheControl = map[string]string{"type": "ephemeral"}
		}
		out = append(out, ab)
	}
	return out
}

func (a *Anthropic) Complete(ctx context.Context, req Request) (*Response, error) {
	if !a.Available() {
		return nil, ErrNotConfigured
	}
	body := apiRequest{Model: req.Model, MaxTokens: req.MaxTokens, System: toAPIBlocks(req.System)}
	if req.Effort != "" {
		body.OutputConfig = map[string]string{"effort": req.Effort}
	}
	for _, m := range req.Messages {
		body.Messages = append(body.Messages, apiMessage{Role: m.Role, Content: toAPIBlocks(m.Blocks)})
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for attempt := 0; attempt <= a.maxRetries; attempt++ {
		if attempt > 0 {
			if err := sleep(ctx, a.delay(attempt, lastErr)); err != nil {
				return nil, err
			}
		}
		resp, err := a.do(ctx, payload)
		if err == nil {
			return resp, nil
		}
		lastErr = err
		var apiErr *APIError
		if errors.As(err, &apiErr) && !apiErr.Retryable {
			return nil, err
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
	}
	return nil, lastErr
}

type retryAfterError struct {
	*APIError
	after time.Duration
}

func (a *Anthropic) delay(attempt int, last error) time.Duration {
	var ra *retryAfterError
	if errors.As(last, &ra) && ra.after > 0 && ra.after < 30*time.Second {
		return ra.after
	}
	d := a.backoff << (attempt - 1)
	return d + time.Duration(rand.Int63n(int64(a.backoff)))
}

func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func (a *Anthropic) do(ctx context.Context, payload []byte) (*Response, error) {
	ctx, cancel := context.WithTimeout(ctx, a.timeout)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.baseURL+"/v1/messages", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("content-type", "application/json")
	httpReq.Header.Set("x-api-key", a.apiKey)
	httpReq.Header.Set("anthropic-version", anthropicVersion)

	res, err := a.client.Do(httpReq)
	if err != nil {
		return nil, &APIError{Kind: "network", Retryable: true}
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, maxResponseBytes))
	if err != nil {
		return nil, &APIError{Status: res.StatusCode, Kind: "read", Retryable: true}
	}
	if res.StatusCode != http.StatusOK {
		apiErr := &APIError{Status: res.StatusCode, Kind: "http", Retryable: res.StatusCode == 408 || res.StatusCode == 409 || res.StatusCode == 429 || res.StatusCode >= 500}
		if secs, convErr := strconv.Atoi(res.Header.Get("retry-after")); convErr == nil && secs > 0 {
			return nil, &retryAfterError{APIError: apiErr, after: time.Duration(secs) * time.Second}
		}
		return nil, apiErr
	}
	var parsed apiResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return nil, &APIError{Status: res.StatusCode, Kind: "decode"}
	}
	var text strings.Builder
	for _, c := range parsed.Content {
		if c.Type == "text" {
			text.WriteString(c.Text)
		}
	}
	return &Response{
		Text:             text.String(),
		Model:            parsed.Model,
		StopReason:       parsed.StopReason,
		InputTokens:      parsed.Usage.InputTokens,
		OutputTokens:     parsed.Usage.OutputTokens,
		CacheReadTokens:  parsed.Usage.CacheReadTokens,
		CacheWriteTokens: parsed.Usage.CacheWriteTokens,
	}, nil
}

func (e *retryAfterError) Unwrap() error { return e.APIError }
