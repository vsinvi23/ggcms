package oauth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/serenya/go-cms/internal/application/identity"
	"golang.org/x/oauth2"
)

const httpTimeout = 10 * time.Second

type keySource interface {
	key(ctx context.Context, kid string) (*rsa.PublicKey, error)
}

type jwksCache struct {
	url     string
	client  *http.Client
	mu      sync.Mutex
	keys    map[string]*rsa.PublicKey
	fetched time.Time
}

func newJWKSCache(url string, client *http.Client) *jwksCache {
	return &jwksCache{url: url, client: client, keys: map[string]*rsa.PublicKey{}}
}

func (c *jwksCache) key(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if k, ok := c.keys[kid]; ok && time.Since(c.fetched) < time.Hour {
		return k, nil
	}
	if time.Since(c.fetched) > time.Minute {
		if err := c.refresh(ctx); err != nil {
			return nil, err
		}
	}
	if k, ok := c.keys[kid]; ok {
		return k, nil
	}
	return nil, errors.New("unknown signing key")
}

func (c *jwksCache) refresh(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url, nil)
	if err != nil {
		return err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("jwks status %d", resp.StatusCode)
	}
	var doc struct {
		Keys []struct {
			Kty string `json:"kty"`
			Kid string `json:"kid"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&doc); err != nil {
		return err
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range doc.Keys {
		if k.Kty != "RSA" {
			continue
		}
		n, err1 := base64.RawURLEncoding.DecodeString(k.N)
		e, err2 := base64.RawURLEncoding.DecodeString(k.E)
		if err1 != nil || err2 != nil {
			continue
		}
		keys[k.Kid] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: int(new(big.Int).SetBytes(e).Int64())}
	}
	c.keys = keys
	c.fetched = time.Now()
	return nil
}

type oidcProvider struct {
	name    string
	cfg     *oauth2.Config
	issuers []string
	keys    keySource
	usePKCE bool
	client  *http.Client
}

func (p *oidcProvider) Name() string { return p.name }

func (p *oidcProvider) AuthURL(state, nonce, challenge string) string {
	opts := []oauth2.AuthCodeOption{oauth2.SetAuthURLParam("nonce", nonce)}
	if p.usePKCE {
		opts = append(opts,
			oauth2.SetAuthURLParam("code_challenge", challenge),
			oauth2.SetAuthURLParam("code_challenge_method", "S256"))
	}
	return p.cfg.AuthCodeURL(state, opts...)
}

func (p *oidcProvider) Exchange(ctx context.Context, code, verifier, nonce string) (*identity.Claims, error) {
	ctx = context.WithValue(ctx, oauth2.HTTPClient, p.client)
	var opts []oauth2.AuthCodeOption
	if p.usePKCE {
		opts = append(opts, oauth2.VerifierOption(verifier))
	}
	tok, err := p.cfg.Exchange(ctx, code, opts...)
	if err != nil {
		return nil, fmt.Errorf("%s code exchange: %w", p.name, err)
	}
	raw, _ := tok.Extra("id_token").(string)
	if raw == "" {
		return nil, fmt.Errorf("%s: missing id_token", p.name)
	}
	return p.validateIDToken(ctx, raw, nonce)
}

type idTokenClaims struct {
	jwt.RegisteredClaims
	Nonce         string      `json:"nonce"`
	Email         string      `json:"email"`
	EmailVerified interface{} `json:"email_verified"`
	Name          string      `json:"name"`
	Picture       string      `json:"picture"`
}

func (p *oidcProvider) validateIDToken(ctx context.Context, raw, nonce string) (*identity.Claims, error) {
	claims := &idTokenClaims{}
	_, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (interface{}, error) {
		kid, _ := t.Header["kid"].(string)
		return p.keys.key(ctx, kid)
	},
		jwt.WithValidMethods([]string{"RS256"}),
		jwt.WithAudience(p.cfg.ClientID),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(time.Minute),
	)
	if err != nil {
		return nil, fmt.Errorf("%s id_token: %w", p.name, err)
	}
	issOK := false
	for _, i := range p.issuers {
		if claims.Issuer == i {
			issOK = true
		}
	}
	if !issOK {
		return nil, fmt.Errorf("%s id_token: bad issuer", p.name)
	}
	if nonce == "" || claims.Nonce != nonce {
		return nil, fmt.Errorf("%s id_token: nonce mismatch", p.name)
	}
	if claims.Subject == "" {
		return nil, fmt.Errorf("%s id_token: missing sub", p.name)
	}
	verified := false
	switch v := claims.EmailVerified.(type) {
	case bool:
		verified = v
	case string:
		verified = v == "true"
	}
	return &identity.Claims{
		Provider:       p.name,
		ProviderUserID: claims.Subject,
		Email:          claims.Email,
		EmailVerified:  verified,
		Name:           claims.Name,
		AvatarURL:      claims.Picture,
	}, nil
}

func newGoogle(clientID, secret, redirect string, client *http.Client) *oidcProvider {
	return &oidcProvider{
		name: "google",
		cfg: &oauth2.Config{
			ClientID: clientID, ClientSecret: secret, RedirectURL: redirect,
			Scopes:   []string{"openid", "email", "profile"},
			Endpoint: oauth2.Endpoint{AuthURL: "https://accounts.google.com/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token"},
		},
		issuers: []string{"https://accounts.google.com", "accounts.google.com"},
		keys:    newJWKSCache("https://www.googleapis.com/oauth2/v3/certs", client),
		usePKCE: true,
		client:  client,
	}
}

func newLinkedIn(clientID, secret, redirect string, client *http.Client) *oidcProvider {
	return &oidcProvider{
		name: "linkedin",
		cfg: &oauth2.Config{
			ClientID: clientID, ClientSecret: secret, RedirectURL: redirect,
			Scopes:   []string{"openid", "profile", "email"},
			Endpoint: oauth2.Endpoint{AuthURL: "https://www.linkedin.com/oauth/v2/authorization", TokenURL: "https://www.linkedin.com/oauth/v2/accessToken", AuthStyle: oauth2.AuthStyleInParams},
		},
		issuers: []string{"https://www.linkedin.com/oauth"},
		keys:    newJWKSCache("https://www.linkedin.com/oauth/openid/jwks", client),
		usePKCE: false,
		client:  client,
	}
}
