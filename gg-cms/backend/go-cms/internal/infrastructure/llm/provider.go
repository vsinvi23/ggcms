package llm

import (
	"context"
	"errors"
	"fmt"
)

var ErrNotConfigured = errors.New("llm provider not configured")

type Block struct {
	Text  string
	Cache bool
}

type Message struct {
	Role   string
	Blocks []Block
}

type Request struct {
	Model     string
	System    []Block
	Messages  []Message
	MaxTokens int
	Effort    string
}

type Response struct {
	Text             string
	Model            string
	StopReason       string
	InputTokens      int
	OutputTokens     int
	CacheReadTokens  int
	CacheWriteTokens int
}

type Provider interface {
	Name() string
	Available() bool
	Complete(ctx context.Context, req Request) (*Response, error)
}

type APIError struct {
	Status    int
	Kind      string
	Retryable bool
}

func (e *APIError) Error() string {
	return fmt.Sprintf("llm api error: status=%d kind=%s", e.Status, e.Kind)
}
