package oauth

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"net/http"
	"time"

	"github.com/serenya/go-cms/internal/application/identity"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/config"
	"github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
)

const (
	IntentLogin = "login"
	IntentLink  = "link"

	txTTL = 10 * time.Minute

	StatusOK           = "ok"
	StatusLinked       = "linked"
	StatusLinkRequired = "link_required"
	StatusEmailNeeded  = "email_needed"
)

type ProviderInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type StartResult struct {
	URL     string
	Binding string
	TTL     time.Duration
}

type CallbackResult struct {
	Status   string
	Redirect string
	Ticket   string
	Created  bool
	User     *entity.User
	Tokens   *identity.Tokens
	Provider string
}

type IdentityInfo struct {
	Provider  string     `json:"provider"`
	Email     string     `json:"email,omitempty"`
	Name      string     `json:"name,omitempty"`
	LinkedAt  time.Time  `json:"linkedAt"`
	LastLogin *time.Time `json:"lastLoginAt,omitempty"`
}

type Service interface {
	Providers() []ProviderInfo
	Start(ctx context.Context, provider, redirect, intent string, linkUserID uint) (*StartResult, error)
	Callback(ctx context.Context, provider, code, state, providerErr, binding string, meta identity.Meta) (*CallbackResult, error)
	ConfirmLink(ctx context.Context, ticket, password string, meta identity.Meta) (*entity.User, *identity.Tokens, error)
	SendLinkEmail(ctx context.Context, ticket string) error
	SubmitSignupEmail(ctx context.Context, ticket, email string) error
	ListIdentities(ctx context.Context, userID uint) ([]IdentityInfo, error)
	Unlink(ctx context.Context, userID uint, provider string, meta identity.Meta) (*identity.Tokens, error)
}

type service struct {
	providers map[string]Provider
	order     []string
	labels    map[string]string
	txs       repository.OAuthTransactionRepository
	identity  *identity.Service
	sessions  *identity.Sessions
}

func NewService(
	cfg *config.OAuthConfig,
	txs repository.OAuthTransactionRepository,
	idSvc *identity.Service,
	sessions *identity.Sessions,
) Service {
	client := &http.Client{Timeout: httpTimeout}
	s := &service{
		providers: map[string]Provider{},
		labels:    map[string]string{"google": "Google", "github": "GitHub", "linkedin": "LinkedIn"},
		txs:       txs, identity: idSvc, sessions: sessions,
	}
	if p := cfg.Google; p.Enabled {
		s.register(newGoogle(p.ClientID, p.ClientSecret, p.RedirectURL, client))
	}
	if p := cfg.GitHub; p.Enabled {
		s.register(newGitHub(p.ClientID, p.ClientSecret, p.RedirectURL, client))
	}
	if p := cfg.LinkedIn; p.Enabled {
		s.register(newLinkedIn(p.ClientID, p.ClientSecret, p.RedirectURL, client))
	}
	return s
}

func (s *service) register(p Provider) {
	s.providers[p.Name()] = p
	s.order = append(s.order, p.Name())
}

func (s *service) Providers() []ProviderInfo {
	out := make([]ProviderInfo, 0, len(s.order))
	for _, n := range s.order {
		out = append(out, ProviderInfo{ID: n, Name: s.labels[n]})
	}
	return out
}

func (s *service) Start(ctx context.Context, provider, redirect, intent string, linkUserID uint) (*StartResult, error) {
	p, ok := s.providers[provider]
	if !ok {
		return nil, newErr(CodeProviderDisabled, nil)
	}
	if intent != IntentLink {
		intent = IntentLogin
	}
	state, err := identity.RandomToken(32)
	if err != nil {
		return nil, newErr(CodeServerError, err)
	}
	nonce, err := identity.RandomToken(32)
	if err != nil {
		return nil, newErr(CodeServerError, err)
	}
	vb, err := identity.RandomToken(32)
	if err != nil {
		return nil, newErr(CodeServerError, err)
	}
	verifier := base64.RawURLEncoding.EncodeToString([]byte(vb))[:64]
	binding, err := identity.RandomToken(32)
	if err != nil {
		return nil, newErr(CodeServerError, err)
	}

	now := time.Now()
	tx := &entity.OAuthTransaction{
		State: state, Provider: provider, Nonce: nonce, CodeVerifier: verifier,
		BindingHash: identity.HashToken(binding), Intent: intent,
		RedirectPath: SafeRedirect(redirect), ExpiresAt: now.Add(txTTL), CreatedAt: now,
	}
	if intent == IntentLink {
		tx.LinkUserID = &linkUserID
	}
	if err := s.txs.Create(ctx, tx); err != nil {
		return nil, newErr(CodeServerError, err)
	}
	return &StartResult{URL: p.AuthURL(state, nonce, pkceChallenge(verifier)), Binding: binding, TTL: txTTL}, nil
}

func (s *service) Callback(ctx context.Context, provider, code, state, providerErr, binding string, meta identity.Meta) (*CallbackResult, error) {
	p, ok := s.providers[provider]
	if !ok {
		return nil, newErr(CodeProviderDisabled, nil)
	}
	if state == "" || binding == "" {
		return nil, newErr(CodeInvalidState, nil)
	}
	tx, err := s.txs.Consume(ctx, state, time.Now())
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, newErr(CodeInvalidState, nil)
		}
		return nil, newErr(CodeServerError, err)
	}
	if tx.Provider != provider || subtle.ConstantTimeCompare([]byte(identity.HashToken(binding)), []byte(tx.BindingHash)) != 1 {
		return nil, newErr(CodeInvalidState, nil)
	}
	if providerErr != "" {
		if providerErr == "access_denied" {
			return nil, newErr(CodeAccessDenied, nil)
		}
		return nil, newErr(CodeProviderError, nil)
	}
	if code == "" {
		return nil, newErr(CodeProviderError, nil)
	}

	claims, err := p.Exchange(ctx, code, tx.CodeVerifier, tx.Nonce)
	if err != nil {
		logger.Warn("oauth: provider exchange failed", zap.String("provider", provider), zap.Error(err))
		return nil, newErr(CodeProviderError, err)
	}

	res := &CallbackResult{Redirect: tx.RedirectPath, Provider: provider}

	if tx.Intent == IntentLink && tx.LinkUserID != nil {
		if err := s.identity.LinkToUser(ctx, *tx.LinkUserID, *claims); err != nil {
			if errors.Is(err, identity.ErrIdentityAlreadyLinked) {
				return nil, newErr(CodeIdentityAlreadyLinked, err)
			}
			return nil, newErr(CodeServerError, err)
		}
		res.Status = StatusLinked
		return res, nil
	}

	outcome, err := s.identity.ResolveLogin(ctx, *claims)
	if err != nil {
		switch {
		case errors.Is(err, identity.ErrAccountDisabled):
			return nil, newErr(CodeAccountDisabled, err)
		case errors.Is(err, identity.ErrEmailUnverified):
			return nil, newErr(CodeEmailUnverified, err)
		case errors.Is(err, identity.ErrIdentityAlreadyLinked):
			return nil, newErr(CodeIdentityAlreadyLinked, err)
		}
		return nil, newErr(CodeServerError, err)
	}

	switch outcome.Kind {
	case identity.OutcomeLinkRequired:
		res.Status, res.Ticket = StatusLinkRequired, outcome.Ticket
	case identity.OutcomeEmailNeeded:
		res.Status, res.Ticket = StatusEmailNeeded, outcome.Ticket
	default:
		u, tokens, err := s.sessions.Issue(ctx, outcome.User.ID, meta, time.Now())
		if err != nil {
			if errors.Is(err, identity.ErrAccountDisabled) {
				return nil, newErr(CodeAccountDisabled, err)
			}
			return nil, newErr(CodeServerError, err)
		}
		res.Status, res.User, res.Tokens = StatusOK, u, tokens
		res.Created = outcome.Kind == identity.OutcomeCreated
	}
	return res, nil
}

func (s *service) ConfirmLink(ctx context.Context, ticket, password string, meta identity.Meta) (*entity.User, *identity.Tokens, error) {
	u, err := s.identity.ConfirmLinkWithPassword(ctx, ticket, password)
	if err != nil {
		return nil, nil, err
	}
	return s.sessions.Issue(ctx, u.ID, meta, time.Now())
}

func (s *service) SendLinkEmail(ctx context.Context, ticket string) error {
	return s.identity.SendLinkEmail(ctx, ticket)
}

func (s *service) SubmitSignupEmail(ctx context.Context, ticket, email string) error {
	return s.identity.SubmitSignupEmail(ctx, ticket, email)
}

func (s *service) ListIdentities(ctx context.Context, userID uint) ([]IdentityInfo, error) {
	list, err := s.identity.ListIdentities(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]IdentityInfo, 0, len(list))
	for _, i := range list {
		out = append(out, IdentityInfo{Provider: i.Provider, Email: i.ProviderEmail, Name: i.DisplayName, LinkedAt: i.LinkedAt, LastLogin: i.LastLoginAt})
	}
	return out, nil
}

// Unlink removes the identity, revokes every other session and re-issues one for the caller.
func (s *service) Unlink(ctx context.Context, userID uint, provider string, meta identity.Meta) (*identity.Tokens, error) {
	if err := s.identity.Unlink(ctx, userID, provider); err != nil {
		return nil, err
	}
	_, tokens, err := s.sessions.Issue(ctx, userID, meta, time.Now())
	return tokens, err
}
