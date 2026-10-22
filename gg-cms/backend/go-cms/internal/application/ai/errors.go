package ai

import "net/http"

type Error struct {
	Code    string
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

var (
	ErrDisabled        = &Error{"AI_DISABLED", http.StatusServiceUnavailable, "AI features are disabled"}
	ErrFeatureDisabled = &Error{"AI_FEATURE_DISABLED", http.StatusServiceUnavailable, "this AI feature is disabled"}
	ErrNotConfigured   = &Error{"AI_NOT_CONFIGURED", http.StatusServiceUnavailable, "AI provider is not configured"}
	ErrRateLimited     = &Error{"AI_RATE_LIMITED", http.StatusTooManyRequests, "too many AI requests, slow down"}
	ErrDailyLimit      = &Error{"AI_DAILY_LIMIT", http.StatusTooManyRequests, "daily AI usage limit reached"}
	ErrBudgetExceeded  = &Error{"AI_BUDGET_EXCEEDED", http.StatusTooManyRequests, "AI budget exhausted for this period"}
	ErrRequestTooLarge = &Error{"AI_REQUEST_TOO_LARGE", http.StatusRequestEntityTooLarge, "request exceeds the per-request AI budget"}
	ErrUpstream        = &Error{"AI_UPSTREAM_ERROR", http.StatusBadGateway, "AI provider request failed"}
	ErrRefused         = &Error{"AI_REFUSED", http.StatusUnprocessableEntity, "the model declined this request"}
	ErrBadOutput       = &Error{"AI_BAD_OUTPUT", http.StatusBadGateway, "AI returned an unusable response"}
	ErrInvalidInput    = &Error{"AI_INVALID_INPUT", http.StatusBadRequest, "invalid input"}
	ErrNotFound        = &Error{"AI_NOT_FOUND", http.StatusNotFound, "not found"}
	ErrForbidden       = &Error{"AI_FORBIDDEN", http.StatusForbidden, "access denied"}
)

func invalid(msg string) *Error { return &Error{ErrInvalidInput.Code, ErrInvalidInput.Status, msg} }
