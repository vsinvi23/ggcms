package oauth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/url"
	"strings"

	"github.com/serenya/go-cms/internal/application/identity"
)

// Fixed error-code enum surfaced to the browser. Nothing else may be reflected.
const (
	CodeAccessDenied          = "access_denied"
	CodeInvalidState          = "invalid_state"
	CodeProviderError         = "provider_error"
	CodeEmailUnverified       = "email_unverified"
	CodeEmailMissing          = "email_missing"
	CodeAccountDisabled       = "account_disabled"
	CodeLinkRequired          = "link_required"
	CodeIdentityAlreadyLinked = "identity_already_linked"
	CodeProviderDisabled      = "provider_disabled"
	CodeRateLimited           = "rate_limited"
	CodeServerError           = "server_error"
)

type Error struct {
	Code string
	Err  error
}

func (e *Error) Error() string { return e.Code }
func (e *Error) Unwrap() error { return e.Err }

func newErr(code string, err error) *Error { return &Error{Code: code, Err: err} }

// ErrorCode extracts the enum code from err, defaulting to server_error.
func ErrorCode(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.Code
	}
	return CodeServerError
}

type Provider interface {
	Name() string
	AuthURL(state, nonce, challenge string) string
	Exchange(ctx context.Context, code, verifier, nonce string) (*identity.Claims, error)
}

func pkceChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// SafeRedirect returns p only if it is a plain relative path; otherwise "/".
func SafeRedirect(p string) string {
	if p == "" || len(p) > 512 || p[0] != '/' || strings.HasPrefix(p, "//") || strings.ContainsAny(p, "\\\r\n\t") {
		return "/"
	}
	for _, r := range p {
		if r < 0x20 || r == 0x7f {
			return "/"
		}
	}
	u, err := url.Parse(p)
	if err != nil || u.Scheme != "" || u.Host != "" || u.User != nil {
		return "/"
	}
	return p
}
