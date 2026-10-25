package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/application/identity"
	"github.com/serenya/go-cms/internal/application/identity/identitytest"
	"github.com/serenya/go-cms/pkg/config"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
	"github.com/serenya/go-cms/pkg/password"
)

var ctx = context.Background()

const strongPwd = "correct horse battery staple"

type env struct {
	svc      *service
	store    *identitytest.Store
	mail     *identitytest.Mail
	jwt      *jwtpkg.Manager
	guard    *identity.SessionGuard
	sessions *identity.Sessions
}

func newEnv() *env {
	store := identitytest.NewStore()
	mail := &identitytest.Mail{}
	jm := jwtpkg.NewManager(&config.JWTConfig{Secret: "0123456789abcdef0123456789abcdef", Issuer: "i", Audience: "a", AccessTTLMinutes: 15})
	guard := identity.NewSessionGuard(store)
	sessions := identity.NewSessions(store, store, store.RefreshRepo(), jm, guard, time.Hour)
	notifier := identity.NewNotifier(mail, false)
	idSvc := identity.NewService(store, store, store.IdentityRepo(), store.EmailRepo(), sessions, notifier, "http://fe")
	svc := NewService(store, store, store.ResetRepo(), sessions, idSvc, notifier, "http://fe", false, 5*time.Minute).(*service)
	return &env{svc: svc, store: store, mail: mail, jwt: jm, guard: guard, sessions: sessions}
}

func (e *env) userWithPassword(t *testing.T, email string) uint {
	u := e.store.AddUser(email, true)
	h, _ := password.Hash(strongPwd)
	e.store.Users[u.ID].PasswordHash = h
	return u.ID
}

func TestRegisterIsUniformAndNormalisesEmail(t *testing.T) {
	e := newEnv()
	if err := e.svc.Register(ctx, "  New@Example.COM ", strongPwd, "New User"); err != nil {
		t.Fatal(err)
	}
	if len(e.store.Users) != 1 {
		t.Fatal("user must be created")
	}
	var u = e.store.Users[1]
	if u.Email != "new@example.com" || u.EmailVerified || len(u.Groups) != 1 || u.Groups[0].Name != identity.LearnerGroup {
		t.Fatalf("bad user %+v", u)
	}
	if err := e.svc.Register(ctx, "NEW@example.com", strongPwd, "Someone Else"); err != nil {
		t.Fatalf("duplicate registration must look identical to success, got %v", err)
	}
	if len(e.store.Users) != 1 {
		t.Fatal("duplicate must not create a second account")
	}
}

func TestRegisterEnforcesPolicyAndNameCap(t *testing.T) {
	e := newEnv()
	for name, args := range map[string][3]string{
		"short":    {"a@example.com", "short1!", "N"},
		"common":   {"b@example.com", "password1234", "N"},
		"too long": {"c@example.com", string(make([]byte, 80)) + "aA1!", "N"},
		"name cap": {"d@example.com", strongPwd, string(make([]rune, 101))},
		"email":    {"not-an-email", strongPwd, "N"},
	} {
		if err := e.svc.Register(ctx, args[0], args[1], args[2]); err == nil {
			t.Errorf("%s must be rejected", name)
		}
	}
	if len(e.store.Users) != 0 {
		t.Fatal("rejected registrations must not create users")
	}
}

func TestLoginAndSessionFlow(t *testing.T) {
	e := newEnv()
	e.userWithPassword(t, "user@example.com")

	if _, err := e.svc.Login(ctx, "user@example.com", "wrong-password-123", identity.Meta{}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("want invalid credentials, got %v", err)
	}
	if _, err := e.svc.Login(ctx, "nobody@example.com", "wrong-password-123", identity.Meta{}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("unknown email must look like a wrong password, got %v", err)
	}
	sess, err := e.svc.Login(ctx, " USER@example.com ", strongPwd, identity.Meta{})
	if err != nil || sess.Tokens.Access == "" || sess.Tokens.Refresh == "" {
		t.Fatalf("login failed: %v", err)
	}
	if _, err := e.jwt.Validate(sess.Tokens.Access); err != nil {
		t.Fatalf("access token must validate: %v", err)
	}
}

func TestSocialOnlyAccountCannotLoginWithPassword(t *testing.T) {
	e := newEnv()
	id := e.userWithPassword(t, "social@example.com")
	e.store.Users[id].PasswordSet = false
	if _, err := e.svc.Login(ctx, "social@example.com", strongPwd, identity.Meta{}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("want invalid credentials, got %v", err)
	}
}

func TestChangePasswordRevokesOtherSessions(t *testing.T) {
	e := newEnv()
	id := e.userWithPassword(t, "user@example.com")
	other, _ := e.svc.Login(ctx, "user@example.com", strongPwd, identity.Meta{})
	oc, _ := e.jwt.Validate(other.Tokens.Access)

	if _, err := e.svc.ChangePassword(ctx, id, "wrong", "another very strong pass", time.Now(), identity.Meta{}); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("wrong current password must fail, got %v", err)
	}
	if _, err := e.svc.ChangePassword(ctx, id, strongPwd, "password1234", time.Now(), identity.Meta{}); err == nil {
		t.Fatal("weak new password must fail")
	}
	cur, err := e.svc.ChangePassword(ctx, id, strongPwd, "another very strong pass", time.Now(), identity.Meta{})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.guard.Check(ctx, oc.UserID, oc.TokenVersion); err == nil {
		t.Fatal("other sessions' access tokens must be revoked")
	}
	if _, _, err := e.sessions.Refresh(ctx, other.Tokens.Refresh, identity.Meta{}); err == nil {
		t.Fatal("other sessions' refresh tokens must be revoked")
	}
	nc, _ := e.jwt.Validate(cur.Tokens.Access)
	if _, err := e.guard.Check(ctx, nc.UserID, nc.TokenVersion); err != nil {
		t.Fatalf("the current device must stay signed in: %v", err)
	}
	if _, err := e.svc.Login(ctx, "user@example.com", "another very strong pass", identity.Meta{}); err != nil {
		t.Fatalf("new password must work: %v", err)
	}
}

func TestSetPasswordForSocialUserRequiresRecentAuth(t *testing.T) {
	e := newEnv()
	id := e.userWithPassword(t, "social@example.com")
	e.store.Users[id].PasswordSet = false
	if _, err := e.svc.ChangePassword(ctx, id, "", "another very strong pass", time.Now().Add(-time.Hour), identity.Meta{}); !errors.Is(err, ErrReauthRequired) {
		t.Fatalf("stale login must require re-auth, got %v", err)
	}
	if _, err := e.svc.ChangePassword(ctx, id, "", "another very strong pass", time.Now(), identity.Meta{}); err != nil {
		t.Fatalf("fresh login may set a password: %v", err)
	}
}

func TestPasswordResetRevokesEverythingAndIsSingleUse(t *testing.T) {
	e := newEnv()
	id := e.userWithPassword(t, "user@example.com")
	sess, _ := e.svc.Login(ctx, "user@example.com", strongPwd, identity.Meta{})
	c, _ := e.jwt.Validate(sess.Tokens.Access)

	e.svc.sendReset(ctx, "user@example.com")
	e.svc.sendReset(ctx, "user@example.com")
	if live := countLive(e); live != 1 {
		t.Fatalf("requesting a new reset must invalidate older tokens, live=%d", live)
	}
	e.svc.sendReset(ctx, "unknown@example.com")

	var raw string
	for _, r := range e.store.Resets {
		if r.UsedAt == nil {
			raw = r.TokenHash
		}
	}
	if raw == "" {
		t.Fatal("expected a live reset token")
	}
	code := bruteCode(t, e)
	if err := e.svc.ConfirmReset(ctx, code, "password1234"); err == nil {
		t.Fatal("weak password must be rejected without consuming the token")
	}
	if err := e.svc.ConfirmReset(ctx, code, "brand new strong passphrase"); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.ConfirmReset(ctx, code, "yet another strong passphrase"); !errors.Is(err, ErrInvalidResetCode) {
		t.Fatalf("token must be single-use, got %v", err)
	}
	if _, err := e.guard.Check(ctx, c.UserID, c.TokenVersion); err == nil {
		t.Fatal("reset must revoke existing access tokens")
	}
	if _, _, err := e.sessions.Refresh(ctx, sess.Tokens.Refresh, identity.Meta{}); err == nil {
		t.Fatal("reset must revoke refresh tokens")
	}
	if _, err := e.svc.Login(ctx, "user@example.com", "brand new strong passphrase", identity.Meta{}); err != nil {
		t.Fatalf("new password must work: %v", err)
	}
	_ = id
}

func countLive(e *env) int {
	n := 0
	for _, r := range e.store.Resets {
		if r.UsedAt == nil {
			n++
		}
	}
	return n
}

// bruteCode recovers the raw code by re-issuing a reset with a known token hash.
func bruteCode(t *testing.T, e *env) string {
	for _, r := range e.store.Resets {
		if r.UsedAt == nil {
			code := "known-reset-code-for-test"
			r.TokenHash = identity.HashToken(code)
			return code
		}
	}
	t.Fatal("no live reset token")
	return ""
}

func TestVerifyEmailMarksVerified(t *testing.T) {
	e := newEnv()
	if err := e.svc.Register(ctx, "v@example.com", strongPwd, "V"); err != nil {
		t.Fatal(err)
	}
	if len(e.store.Tokens) != 1 {
		t.Fatalf("expected a verification token, got %d", len(e.store.Tokens))
	}
	tok := e.store.Tokens[0]
	tok.TokenHash = identity.HashToken("the-token")
	res, err := e.svc.VerifyEmail(ctx, "the-token", identity.Meta{})
	if err != nil || res.Kind != identity.VerifiedResult || res.Session != nil {
		t.Fatalf("bad result %+v %v", res, err)
	}
	if !e.store.Users[1].EmailVerified {
		t.Fatal("user must be marked verified")
	}
	if _, err := e.svc.VerifyEmail(ctx, "the-token", identity.Meta{}); err == nil {
		t.Fatal("verification token must be single-use")
	}
}

func TestLoginLockoutAfterRepeatedFailures(t *testing.T) {
	e := newEnv()
	e.svc.throttle = identity.NewLoginThrottle(3, 10, time.Minute, time.Hour)
	e.userWithPassword(t, "lock@example.com")
	meta := identity.Meta{IP: "9.9.9.9"}

	for i := 0; i < 2; i++ {
		if _, err := e.svc.Login(ctx, "lock@example.com", "wrong password here", meta); !errors.Is(err, ErrInvalidCredentials) {
			t.Fatalf("attempt %d: %v", i+1, err)
		}
	}
	if _, err := e.svc.Login(ctx, "lock@example.com", "wrong password here", meta); !errors.Is(err, ErrTooManyAttempts) {
		t.Fatalf("third failure must lock, got %v", err)
	}
	if _, err := e.svc.Login(ctx, "lock@example.com", strongPwd, meta); !errors.Is(err, ErrTooManyAttempts) {
		t.Fatalf("correct password must be refused while locked, got %v", err)
	}
	if _, err := e.svc.Login(ctx, "ghost@example.com", "wrong password here", meta); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatalf("unknown account must look the same as a wrong password, got %v", err)
	}
}

func TestRecoverPasswordRestrictedToAdmins(t *testing.T) {
	e := newEnv()
	learner := e.store.AddUser("learner@example.com", true, identity.LearnerGroup)
	admin := e.store.AddUser("boss@example.com", true, "Admin")

	if err := e.svc.RecoverPassword(ctx, learner.Email, strongPwd); !errors.Is(err, ErrRecoveryTarget) {
		t.Fatalf("non-admin target must be refused, got %v", err)
	}
	var pe *password.PolicyError
	if err := e.svc.RecoverPassword(ctx, "BOSS@example.com", "short"); !errors.As(err, &pe) {
		t.Fatalf("policy must apply to recovery, got %v", err)
	}
	if err := e.svc.RecoverPassword(ctx, admin.Email, strongPwd); err != nil {
		t.Fatalf("admin recovery: %v", err)
	}
	if !password.Compare(e.store.Users[admin.ID].PasswordHash, strongPwd) {
		t.Fatal("admin password not updated")
	}
}
