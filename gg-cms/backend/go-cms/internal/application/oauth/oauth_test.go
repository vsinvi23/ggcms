package oauth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	gojwt "github.com/golang-jwt/jwt/v5"
	"github.com/serenya/go-cms/internal/application/identity"
	"github.com/serenya/go-cms/internal/application/identity/identitytest"
	"github.com/serenya/go-cms/pkg/config"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
	"golang.org/x/oauth2"
)

var ctx = context.Background()

type fakeProvider struct {
	name      string
	claims    *identity.Claims
	err       error
	gotVerif  string
	gotNonce  string
	challenge string
}

func (f *fakeProvider) Name() string { return f.name }
func (f *fakeProvider) AuthURL(state, nonce, challenge string) string {
	f.challenge = challenge
	return "https://idp.example/auth?state=" + state
}
func (f *fakeProvider) Exchange(_ context.Context, code, verifier, nonce string) (*identity.Claims, error) {
	f.gotVerif, f.gotNonce = verifier, nonce
	return f.claims, f.err
}

func newSvc(p *fakeProvider) (*service, *identitytest.Store) {
	store := identitytest.NewStore()
	jm := jwtpkg.NewManager(&config.JWTConfig{Secret: "0123456789abcdef0123456789abcdef", Issuer: "i", Audience: "a", AccessTTLMinutes: 15})
	guard := identity.NewSessionGuard(store)
	sessions := identity.NewSessions(store, store, store.RefreshRepo(), jm, guard, time.Hour)
	idSvc := identity.NewService(store, store, store.IdentityRepo(), store.EmailRepo(), sessions, identity.NewNotifier(&identitytest.Mail{}, false), "http://fe")
	s := &service{providers: map[string]Provider{}, labels: map[string]string{}, txs: store.TxRepo(), identity: idSvc, sessions: sessions}
	s.register(p)
	return s, store
}

func stateFrom(t *testing.T, raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u.Query().Get("state")
}

func TestStartCallbackHappyPathWithPKCE(t *testing.T) {
	p := &fakeProvider{name: "google", claims: &identity.Claims{Provider: "google", ProviderUserID: "1", Email: "a@example.com", EmailVerified: true}}
	s, _ := newSvc(p)
	start, err := s.Start(ctx, "google", "/courses", IntentLogin, 0)
	if err != nil {
		t.Fatal(err)
	}
	res, err := s.Callback(ctx, "google", "code", stateFrom(t, start.URL), "", start.Binding, identity.Meta{})
	if err != nil || res.Status != StatusOK || res.Tokens == nil || res.Redirect != "/courses" || !res.Created {
		t.Fatalf("bad result %+v %v", res, err)
	}
	if pkceChallenge(p.gotVerif) != p.challenge {
		t.Fatal("code_verifier passed to the token exchange must match the S256 challenge sent in the auth URL")
	}
	if len(p.gotNonce) < 32 {
		t.Fatal("nonce must be passed to the provider")
	}
}

func TestStateIsSingleUse(t *testing.T) {
	p := &fakeProvider{name: "google", claims: &identity.Claims{Provider: "google", ProviderUserID: "1", Email: "a@example.com", EmailVerified: true}}
	s, _ := newSvc(p)
	start, _ := s.Start(ctx, "google", "/", IntentLogin, 0)
	st := stateFrom(t, start.URL)
	if _, err := s.Callback(ctx, "google", "c", st, "", start.Binding, identity.Meta{}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Callback(ctx, "google", "c", st, "", start.Binding, identity.Meta{}); ErrorCode(err) != CodeInvalidState {
		t.Fatalf("replayed state must be invalid_state, got %v", err)
	}
}

func TestStateBoundToBrowserAndProvider(t *testing.T) {
	p := &fakeProvider{name: "google", claims: &identity.Claims{Provider: "google", ProviderUserID: "1", Email: "a@example.com", EmailVerified: true}}
	s, _ := newSvc(p)
	start, _ := s.Start(ctx, "google", "/", IntentLogin, 0)
	st := stateFrom(t, start.URL)

	if _, err := s.Callback(ctx, "google", "c", st, "", "attacker-binding", identity.Meta{}); ErrorCode(err) != CodeInvalidState {
		t.Fatalf("wrong browser binding must fail, got %v", err)
	}
	start2, _ := s.Start(ctx, "google", "/", IntentLogin, 0)
	if _, err := s.Callback(ctx, "google", "c", stateFrom(t, start2.URL), "", "", identity.Meta{}); ErrorCode(err) != CodeInvalidState {
		t.Fatalf("missing binding cookie must fail, got %v", err)
	}
	s.register(&fakeProvider{name: "github"})
	start3, _ := s.Start(ctx, "google", "/", IntentLogin, 0)
	if _, err := s.Callback(ctx, "github", "c", stateFrom(t, start3.URL), "", start3.Binding, identity.Meta{}); ErrorCode(err) != CodeInvalidState {
		t.Fatalf("cross-provider state must fail, got %v", err)
	}
}

func TestExpiredStateRejected(t *testing.T) {
	p := &fakeProvider{name: "google", claims: &identity.Claims{}}
	s, store := newSvc(p)
	start, _ := s.Start(ctx, "google", "/", IntentLogin, 0)
	st := stateFrom(t, start.URL)
	store.Txs[st].ExpiresAt = time.Now().Add(-time.Second)
	if _, err := s.Callback(ctx, "google", "c", st, "", start.Binding, identity.Meta{}); ErrorCode(err) != CodeInvalidState {
		t.Fatalf("expired state must fail, got %v", err)
	}
}

func TestProviderErrorsMapToFixedCodes(t *testing.T) {
	p := &fakeProvider{name: "google", err: errors.New("secret internal detail")}
	s, _ := newSvc(p)
	start, _ := s.Start(ctx, "google", "/", IntentLogin, 0)
	_, err := s.Callback(ctx, "google", "c", stateFrom(t, start.URL), "", start.Binding, identity.Meta{})
	if ErrorCode(err) != CodeProviderError || strings.Contains(err.Error(), "secret") {
		t.Fatalf("provider failure must surface only the enum code, got %q", err.Error())
	}
	start, _ = s.Start(ctx, "google", "/", IntentLogin, 0)
	if _, err := s.Callback(ctx, "google", "", stateFrom(t, start.URL), "access_denied", start.Binding, identity.Meta{}); ErrorCode(err) != CodeAccessDenied {
		t.Fatalf("want access_denied, got %v", err)
	}
	if _, err := s.Start(ctx, "linkedin", "/", IntentLogin, 0); ErrorCode(err) != CodeProviderDisabled {
		t.Fatalf("unconfigured provider must be provider_disabled, got %v", err)
	}
}

func TestUnverifiedProviderEmailYieldsNoAccount(t *testing.T) {
	p := &fakeProvider{name: "google", claims: &identity.Claims{Provider: "google", ProviderUserID: "1", Email: "a@example.com", EmailVerified: false}}
	s, store := newSvc(p)
	start, _ := s.Start(ctx, "google", "/", IntentLogin, 0)
	_, err := s.Callback(ctx, "google", "c", stateFrom(t, start.URL), "", start.Binding, identity.Meta{})
	if ErrorCode(err) != CodeEmailUnverified || len(store.Users) != 0 {
		t.Fatalf("want email_unverified and no user, got %v users=%d", err, len(store.Users))
	}
}

func TestLinkRequiredForExistingVerifiedAccount(t *testing.T) {
	p := &fakeProvider{name: "google", claims: &identity.Claims{Provider: "google", ProviderUserID: "1", Email: "owner@example.com", EmailVerified: true}}
	s, store := newSvc(p)
	store.AddUser("owner@example.com", true)
	start, _ := s.Start(ctx, "google", "/", IntentLogin, 0)
	res, err := s.Callback(ctx, "google", "c", stateFrom(t, start.URL), "", start.Binding, identity.Meta{})
	if err != nil || res.Status != StatusLinkRequired || res.Ticket == "" || res.Tokens != nil {
		t.Fatalf("want link_required without a session, got %+v %v", res, err)
	}
}

func TestLinkIntentAttachesToTxUser(t *testing.T) {
	p := &fakeProvider{name: "github", claims: &identity.Claims{Provider: "github", ProviderUserID: "9", Email: "x@example.com", EmailVerified: true}}
	s, store := newSvc(p)
	u := store.AddUser("me@example.com", true)
	start, _ := s.Start(ctx, "github", "/settings", IntentLink, u.ID)
	res, err := s.Callback(ctx, "github", "c", stateFrom(t, start.URL), "", start.Binding, identity.Meta{})
	if err != nil || res.Status != StatusLinked || len(store.Idents) != 1 || store.Idents[0].UserID != u.ID {
		t.Fatalf("link must attach to the transaction's user: %+v %v", res, err)
	}
}

func TestSafeRedirect(t *testing.T) {
	ok := map[string]string{"": "/", "/": "/", "/courses/1?x=2": "/courses/1?x=2"}
	for in, want := range ok {
		if got := SafeRedirect(in); got != want {
			t.Errorf("%q -> %q want %q", in, got, want)
		}
	}
	for _, bad := range []string{"//evil.com", "https://evil.com", "/\\evil.com", "\\\\evil.com", "javascript:alert(1)", "evil.com", "/a\r\nSet-Cookie: x=1", "http:/evil.com", "/%0d%0a" + strings.Repeat("a", 600)} {
		if got := SafeRedirect(bad); got != "/" {
			t.Errorf("%q must be rejected, got %q", bad, got)
		}
	}
}

func TestErrorCodeNeverLeaksText(t *testing.T) {
	if ErrorCode(errors.New("boom")) != CodeServerError {
		t.Fatal("unknown errors must map to server_error")
	}
}

// ── OIDC id_token validation ────────────────────────────────────────────────

type staticKeys map[string]*rsa.PublicKey

func (s staticKeys) key(_ context.Context, kid string) (*rsa.PublicKey, error) {
	if k, ok := s[kid]; ok {
		return k, nil
	}
	return nil, errors.New("unknown key")
}

func oidcFixture(t *testing.T) (*oidcProvider, *rsa.PrivateKey) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	return &oidcProvider{
		name: "google", cfg: &oauth2.Config{ClientID: "client-1"},
		issuers: []string{"https://accounts.google.com"}, keys: staticKeys{"k1": &key.PublicKey},
	}, key
}

func signIDToken(t *testing.T, key *rsa.PrivateKey, kid string, c idTokenClaims) string {
	tok := gojwt.NewWithClaims(gojwt.SigningMethodRS256, c)
	tok.Header["kid"] = kid
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func goodClaims() idTokenClaims {
	return idTokenClaims{
		RegisteredClaims: gojwt.RegisteredClaims{
			Issuer: "https://accounts.google.com", Subject: "sub-1", Audience: gojwt.ClaimStrings{"client-1"},
			ExpiresAt: gojwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
		Nonce: "n1", Email: "a@example.com", EmailVerified: true, Name: "A",
	}
}

func TestValidateIDToken(t *testing.T) {
	p, key := oidcFixture(t)
	other, _ := rsa.GenerateKey(rand.Reader, 2048)

	c, err := p.validateIDToken(ctx, signIDToken(t, key, "k1", goodClaims()), "n1")
	if err != nil || c.ProviderUserID != "sub-1" || !c.EmailVerified || c.Email != "a@example.com" {
		t.Fatalf("valid token must pass: %+v %v", c, err)
	}

	strVerified := goodClaims()
	strVerified.EmailVerified = "true"
	if c, err := p.validateIDToken(ctx, signIDToken(t, key, "k1", strVerified), "n1"); err != nil || !c.EmailVerified {
		t.Fatalf("string email_verified must be understood: %v", err)
	}
	unverified := goodClaims()
	unverified.EmailVerified = false
	if c, _ := p.validateIDToken(ctx, signIDToken(t, key, "k1", unverified), "n1"); c == nil || c.EmailVerified {
		t.Fatal("unverified email must be reported as unverified")
	}

	bad := map[string]func() string{
		"bad signature": func() string { return signIDToken(t, other, "k1", goodClaims()) },
		"unknown kid":   func() string { return signIDToken(t, key, "zzz", goodClaims()) },
		"bad issuer": func() string {
			c := goodClaims()
			c.Issuer = "https://evil.example"
			return signIDToken(t, key, "k1", c)
		},
		"bad audience": func() string {
			c := goodClaims()
			c.Audience = gojwt.ClaimStrings{"someone-else"}
			return signIDToken(t, key, "k1", c)
		},
		"expired": func() string {
			c := goodClaims()
			c.ExpiresAt = gojwt.NewNumericDate(time.Now().Add(-time.Hour))
			return signIDToken(t, key, "k1", c)
		},
		"wrong nonce": func() string { c := goodClaims(); c.Nonce = "other"; return signIDToken(t, key, "k1", c) },
		"no subject":  func() string { c := goodClaims(); c.Subject = ""; return signIDToken(t, key, "k1", c) },
		"hs256 forged": func() string {
			s, _ := gojwt.NewWithClaims(gojwt.SigningMethodHS256, goodClaims()).SignedString([]byte("x"))
			return s
		},
	}
	for name, mk := range bad {
		if _, err := p.validateIDToken(ctx, mk(), "n1"); err == nil {
			t.Errorf("%s must be rejected", name)
		}
	}
	if _, err := p.validateIDToken(ctx, signIDToken(t, key, "k1", goodClaims()), ""); err == nil {
		t.Error("empty expected nonce must be rejected")
	}
}

// ── GitHub adapter ──────────────────────────────────────────────────────────

func githubFixture(t *testing.T, userStatus, emailsStatus int, emails string) *githubProvider {
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		if r.Form.Get("code_verifier") == "" {
			http.Error(w, "missing verifier", 400)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "tok", "token_type": "bearer"})
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(userStatus)
		_, _ = w.Write([]byte(`{"id":4242,"login":"octo","name":"","avatar_url":"http://a/v.png","email":"public@example.com"}`))
	})
	mux.HandleFunc("/user/emails", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(emailsStatus)
		_, _ = w.Write([]byte(emails))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return &githubProvider{
		cfg:     &oauth2.Config{ClientID: "c", ClientSecret: "s", Endpoint: oauth2.Endpoint{TokenURL: srv.URL + "/token"}},
		apiBase: srv.URL, client: srv.Client(),
	}
}

func TestGitHubUsesOnlyPrimaryVerifiedEmail(t *testing.T) {
	p := githubFixture(t, 200, 200, `[{"email":"unverified@x.com","primary":true,"verified":false},{"email":"second@x.com","primary":false,"verified":true},{"email":"main@x.com","primary":true,"verified":true}]`)
	c, err := p.Exchange(ctx, "code", "verifier", "")
	if err != nil || c.Email != "main@x.com" || !c.EmailVerified || c.ProviderUserID != "4242" || c.Name != "octo" {
		t.Fatalf("bad claims %+v %v", c, err)
	}
}

func TestGitHubNoVerifiedPrimaryMeansNoEmailNeverProfileEmail(t *testing.T) {
	p := githubFixture(t, 200, 200, `[{"email":"unverified@x.com","primary":true,"verified":false}]`)
	c, err := p.Exchange(ctx, "code", "verifier", "")
	if err != nil || c.Email != "" || c.EmailVerified {
		t.Fatalf("must not fall back to the unverified or /user email: %+v %v", c, err)
	}
}

func TestGitHubChecksHTTPStatus(t *testing.T) {
	if _, err := githubFixture(t, 401, 200, `[]`).Exchange(ctx, "code", "v", ""); err == nil {
		t.Fatal("non-200 /user must fail")
	}
	if _, err := githubFixture(t, 200, 403, `{"message":"forbidden"}`).Exchange(ctx, "code", "v", ""); err == nil {
		t.Fatal("non-200 /user/emails must fail")
	}
}
