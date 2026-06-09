package oauth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/config"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
	"golang.org/x/oauth2/google"
)

// OAuthUser holds the normalised profile returned by any provider.
type OAuthUser struct {
	ProviderID string
	Email      string
	Name       string
}

// AuthResult is returned after a successful OAuth login or sign-up.
type AuthResult struct {
	Token string
	User  *entity.User
}

// Service orchestrates the OAuth2 redirect flow.
type Service interface {
	// GetGoogleAuthURL builds the Google consent-page URL for the given state.
	GetGoogleAuthURL(state string) string
	// GetGitHubAuthURL builds the GitHub consent-page URL for the given state.
	GetGitHubAuthURL(state string) string
	// ExchangeGoogleCode trades an authorization code for a Google user profile.
	ExchangeGoogleCode(ctx context.Context, code string) (*OAuthUser, error)
	// ExchangeGitHubCode trades an authorization code for a GitHub user profile.
	ExchangeGitHubCode(ctx context.Context, code string) (*OAuthUser, error)
	// FindOrCreate looks up or creates a local user for the OAuth profile.
	FindOrCreate(ctx context.Context, ou *OAuthUser, provider string) (*AuthResult, error)
	// GenerateState creates a cryptographically signed state token.
	GenerateState() (string, error)
	// ValidateState verifies a state token produced by GenerateState.
	ValidateState(state string) bool
}

type service struct {
	userRepo     repository.UserRepository
	groupRepo    repository.GroupRepository
	jwtManager   *jwtpkg.Manager
	googleConfig *oauth2.Config
	githubConfig *oauth2.Config
	hmacSecret   []byte
}

// NewService constructs an OAuth service.
func NewService(
	userRepo repository.UserRepository,
	groupRepo repository.GroupRepository,
	jwtManager *jwtpkg.Manager,
	cfg *config.OAuthConfig,
) Service {
	return &service{
		userRepo:   userRepo,
		groupRepo:  groupRepo,
		jwtManager: jwtManager,
		hmacSecret: []byte(cfg.StateHMACSecret),
		googleConfig: &oauth2.Config{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURL:  cfg.GoogleRedirectURL,
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
		githubConfig: &oauth2.Config{
			ClientID:     cfg.GitHubClientID,
			ClientSecret: cfg.GitHubClientSecret,
			RedirectURL:  cfg.GitHubRedirectURL,
			Scopes:       []string{"read:user", "user:email"},
			Endpoint:     github.Endpoint,
		},
	}
}

// ── State helpers ─────────────────────────────────────────────────────────────

// GenerateState returns "<nonce>.<base64url(HMAC-SHA256(secret, nonce))>".
// This is stateless — no DB or session required to verify it.
func (s *service) GenerateState() (string, error) {
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	nonceHex := hex.EncodeToString(nonce)
	sig := s.signNonce(nonceHex)
	return nonceHex + "." + sig, nil
}

// ValidateState verifies the HMAC signature embedded in the state token.
func (s *service) ValidateState(state string) bool {
	parts := strings.SplitN(state, ".", 2)
	if len(parts) != 2 {
		return false
	}
	expected := s.signNonce(parts[0])
	return hmac.Equal([]byte(expected), []byte(parts[1]))
}

func (s *service) signNonce(nonce string) string {
	mac := hmac.New(sha256.New, s.hmacSecret)
	mac.Write([]byte(nonce))
	return base64.URLEncoding.EncodeToString(mac.Sum(nil))
}

// ── Auth URL builders ─────────────────────────────────────────────────────────

func (s *service) GetGoogleAuthURL(state string) string {
	return s.googleConfig.AuthCodeURL(state, oauth2.AccessTypeOnline)
}

func (s *service) GetGitHubAuthURL(state string) string {
	return s.githubConfig.AuthCodeURL(state)
}

// ── Code exchange ─────────────────────────────────────────────────────────────

func (s *service) ExchangeGoogleCode(ctx context.Context, code string) (*OAuthUser, error) {
	tok, err := s.googleConfig.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("google code exchange: %w", err)
	}

	client := s.googleConfig.Client(ctx, tok)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		return nil, fmt.Errorf("google userinfo: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var info struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.Unmarshal(body, &info); err != nil {
		return nil, fmt.Errorf("google userinfo parse: %w", err)
	}
	if info.ID == "" || info.Email == "" {
		return nil, errors.New("google userinfo: missing id or email")
	}
	return &OAuthUser{ProviderID: info.ID, Email: info.Email, Name: info.Name}, nil
}

func (s *service) ExchangeGitHubCode(ctx context.Context, code string) (*OAuthUser, error) {
	tok, err := s.githubConfig.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("github code exchange: %w", err)
	}

	client := s.githubConfig.Client(ctx, tok)

	// Fetch basic profile
	resp, err := client.Get("https://api.github.com/user")
	if err != nil {
		return nil, fmt.Errorf("github user: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var profile struct {
		ID    int    `json:"id"`
		Login string `json:"login"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	if err := json.Unmarshal(body, &profile); err != nil {
		return nil, fmt.Errorf("github user parse: %w", err)
	}

	email := profile.Email
	// Email may be empty if user hides it — fetch from emails endpoint
	if email == "" {
		email = s.fetchGitHubPrimaryEmail(client)
	}
	if email == "" {
		return nil, errors.New("github: could not determine user email")
	}

	name := profile.Name
	if name == "" {
		name = profile.Login
	}

	return &OAuthUser{
		ProviderID: fmt.Sprint(profile.ID),
		Email:      email,
		Name:       name,
	}, nil
}

func (s *service) fetchGitHubPrimaryEmail(client *http.Client) string {
	resp, err := client.Get("https://api.github.com/user/emails")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var emails []struct {
		Email   string `json:"email"`
		Primary bool   `json:"primary"`
		Verified bool  `json:"verified"`
	}
	if err := json.Unmarshal(body, &emails); err != nil {
		return ""
	}
	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email
		}
	}
	// Fallback: first verified email
	for _, e := range emails {
		if e.Verified {
			return e.Email
		}
	}
	return ""
}

// ── User find-or-create ───────────────────────────────────────────────────────

// FindOrCreate finds the local user matching the OAuth profile, or creates one.
// Strategy:
//  1. Find by provider ID (fastest, exact match for returning OAuth users)
//  2. Find by email (links OAuth to existing email/password account)
//  3. Create new user (first-time OAuth sign-up)
func (s *service) FindOrCreate(ctx context.Context, ou *OAuthUser, provider string) (*AuthResult, error) {
	var user *entity.User
	var err error

	// 1 — look up by provider ID
	switch provider {
	case "google":
		user, err = s.userRepo.FindByGoogleID(ctx, ou.ProviderID)
	case "github":
		user, err = s.userRepo.FindByGitHubID(ctx, ou.ProviderID)
	}

	if err != nil {
		// 2 — look up by email; link provider if found
		user, err = s.userRepo.FindByEmail(ctx, ou.Email)
		if err == nil {
			// Link provider ID to existing account (best-effort)
			_ = s.userRepo.UpdateOAuthID(ctx, user.ID, provider, ou.ProviderID)
		}
	}

	if err != nil {
		// 3 — create a new user
		user, err = s.createOAuthUser(ctx, ou, provider)
		if err != nil {
			return nil, fmt.Errorf("oauth create user: %w", err)
		}
	}

	if user.Status == entity.UserStatusDeactivated || user.Status == entity.UserStatusInactive {
		return nil, errors.New("account is disabled")
	}

	// Update last login
	now := time.Now()
	_ = s.userRepo.UpdateLastLogin(ctx, user.ID, now)

	// Determine role from groups
	role := "user"
	for _, g := range user.Groups {
		if strings.EqualFold(g.Name, "Admin") {
			role = "admin"
			break
		}
	}

	token, err := s.jwtManager.Generate(user.ID, user.Email, role)
	if err != nil {
		return nil, fmt.Errorf("oauth jwt generate: %w", err)
	}

	return &AuthResult{Token: token, User: user}, nil
}

func (s *service) createOAuthUser(ctx context.Context, ou *OAuthUser, provider string) (*entity.User, error) {
	// Generate a random password hash so the NOT NULL constraint is satisfied.
	// The user will never be able to log in with email/password unless they reset it.
	randBytes := make([]byte, 32)
	rand.Read(randBytes)
	hash, err := bcrypt.GenerateFromPassword(randBytes, bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	name := ou.Name
	if name == "" {
		name = strings.Split(ou.Email, "@")[0]
	}

	user := &entity.User{
		Email:        ou.Email,
		PasswordHash: string(hash),
		Name:         name,
		Status:       entity.UserStatusActive,
	}
	switch provider {
	case "google":
		user.GoogleID = &ou.ProviderID
	case "github":
		user.GitHubID = &ou.ProviderID
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}
	// Re-fetch to load Groups preload
	return s.userRepo.FindByID(ctx, user.ID)
}
