package handler_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	analyticssvc "github.com/serenya/go-cms/internal/application/analytics"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
)

type ingestStub struct {
	analyticssvc.Service
	got analyticssvc.IngestRequest
}

func (s *ingestStub) Ingest(_ context.Context, req analyticssvc.IngestRequest, _ analyticssvc.IngestMeta) (*analyticssvc.IngestResult, error) {
	s.got = req
	if len(req.Events) == 0 {
		return nil, analyticssvc.ErrEmptyBatch
	}
	if len(req.Events) > analyticssvc.MaxBatch {
		return nil, analyticssvc.ErrBatchTooBig
	}
	return &analyticssvc.IngestResult{Accepted: len(req.Events), Rejected: []analyticssvc.IngestRejection{}}, nil
}

func postIngest(body string) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	stub := &ingestStub{}
	r := gin.New()
	r.POST("/api/analytics/events", handler.NewAnalyticsHandler(stub).Ingest)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/analytics/events", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w
}

func TestIngestEndpointLimits(t *testing.T) {
	ev := `{"schemaVersion":1,"eventId":"evt-00000001","eventType":"page_view","contentId":"1","contentType":"article"}`
	if w := postIngest(`{"consent":true,"events":[` + ev + `]}`); w.Code != http.StatusAccepted {
		t.Fatalf("valid: %d %s", w.Code, w.Body.String())
	}
	if w := postIngest(`not json`); w.Code != http.StatusBadRequest {
		t.Fatalf("malformed: %d", w.Code)
	}
	if w := postIngest(`{"events":[]}`); w.Code != http.StatusBadRequest {
		t.Fatalf("empty batch: %d", w.Code)
	}
	many := strings.Repeat(ev+",", 20) + ev
	if w := postIngest(`{"events":[` + many + `]}`); w.Code != http.StatusBadRequest {
		t.Fatalf("21 events: %d", w.Code)
	}
	huge := `{"consent":true,"events":[{"eventType":"page_view","metadata":{"path":"` + strings.Repeat("a", 40<<10) + `"}}]}`
	if w := postIngest(huge); w.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized body: %d", w.Code)
	}
}
