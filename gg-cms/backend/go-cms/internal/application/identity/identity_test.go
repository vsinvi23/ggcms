package identity_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/serenya/go-cms/internal/application/identity"
	"github.com/serenya/go-cms/internal/application/identity/identitytest"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/pkg/config"
	jwtpkg "github.com/serenya/go-cms/pkg/jwt"
)

type env struct {
	store    *identitytest.Store
	mail     *identitytest.Mail
	jwt      *jwtpkg.Manager
	guard    *identity.SessionGuard
	sessions *identity.Sessions
	svc      *identity.Service
}

func newEnv() *env {
	store := identitytest.NewStore()
	mail := &identitytest.Mail{}
	jm := jwtpkg.NewManager(&config.JWTConfig{Secret: "0123456789abcdef0123456789abcdef", Issuer: "i", Audience: "a", AccessTTLMinutes: 15})
	guard := identity.NewSessionGuard(store)
	sessions := identity.NewSessions(store, store, store.RefreshRepo(), jm, guard, time.Hour)
	svc := identity.NewService(store, store, store.IdentityRepo(), store.EmailRepo(), sessions, identity.NewNotifier(mail, false), "http://fe")
	return &env{store: store, mail: mail, jwt: jm, guard: guard, sessions: sessions, svc: svc}
}

func claims(provider, id, email string, verified bool) identity.Claims {
	return identity.Claims{Provider: provider, ProviderUserID: id, Email: email, EmailVerified: verified, Name: "Social User"}
}

var ctx = context.Background()

func TestResolveLogin_NewUserCreatedWithLearnerGroupAndNoAdmin(t *testing.T) {
	e := newEnv()
	out, err := e.svc.ResolveLogin(ctx, claims("google", "g1", "New@Example.com", true))
	if err != nil || out.Kind != identity.OutcomeCreated {
		t.Fatalf("want created, got %v %v", out, err)
	}
	u := out.User
	if u.Email != "new@example.com" || !u.EmailVerified || u.PasswordSet {
		t.Fatalf("bad user %+v", u)
	}
	if identity.RoleFromGroups(u.Groups) != identity.RoleUser || len(u.Groups) != 1 || u.Groups[0].Name != identity.LearnerGroup {
		t.Fatalf("social user must only be Learner, got %+v", u.Groups)
	}
}

func TestResolveLogin_ReturningIdentityIgnoresEmailChange(t *testing.T) {
	e := newEnv()
	first, _ := e.svc.ResolveLogin(ctx, claims("google", "g1", "a@example.com", true))
	other := e.store.AddUser("victim@example.com", true)
	out, err := e.svc.ResolveLogin(ctx, claims("google", "g1", "victim@example.com", true))
	if err != nil || out.Kind != identity.OutcomeLogin || out.User.ID != first.User.ID || out.User.ID == other.ID {
		t.Fatalf("identity must resolve by provider id only: %+v %v", out, err)
	}
}

func TestResolveLogin_UnverifiedProviderEmailNeverLinksOrCreates(t *testing.T) {
	e := newEnv()
	e.store.AddUser("victim@example.com", true)
	_, err := e.svc.ResolveLogin(ctx, claims("google", "g2", "victim@example.com", false))
	if !errors.Is(err, identity.ErrEmailUnverified) {
		t.Fatalf("want ErrEmailUnverified, got %v", err)
	}
	if len(e.store.Idents) != 0 {
		t.Fatal("no identity may be created")
	}
}

func TestResolveLogin_MissingEmailNeedsEmailStep(t *testing.T) {
	e := newEnv()
	out, err := e.svc.ResolveLogin(ctx, claims("github", "42", "", false))
	if err != nil || out.Kind != identity.OutcomeEmailNeeded || out.Ticket == "" {
		t.Fatalf("want email_needed, got %v %v", out, err)
	}
	if len(e.store.Users) != 0 {
		t.Fatal("no account before email verification")
	}
}

func TestResolveLogin_VerifiedLocalAccountRequiresConfirmation(t *testing.T) {
	e := newEnv()
	local := e.store.AddUser("owner@example.com", true)
	out, err := e.svc.ResolveLogin(ctx, claims("google", "g3", "owner@example.com", true))
	if err != nil || out.Kind != identity.OutcomeLinkRequired || out.Ticket == "" {
		t.Fatalf("want link_required, got %v %v", out, err)
	}
	if len(e.store.Idents) != 0 {
		t.Fatal("must not auto-link")
	}
	got, _ := e.store.FindByID(ctx, local.ID)
	if got.PasswordHash != "hash" || got.TokenVersion != 0 {
		t.Fatal("verified account must be untouched")
	}
}

func TestResolveLogin_PreHijackedUnverifiedAccountIsNeutralised(t *testing.T) {
	e := newEnv()
	attacker := e.store.AddUser("victim@example.com", false)
	_, tokens, err := e.sessions.Issue(ctx, attacker.ID, identity.Meta{}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	out, err := e.svc.ResolveLogin(ctx, claims("google", "real-owner", "victim@example.com", true))
	if err != nil || out.Kind != identity.OutcomeLogin || !out.Neutralised || out.User.ID != attacker.ID {
		t.Fatalf("want neutralised login, got %+v %v", out, err)
	}
	got, _ := e.store.FindByID(ctx, attacker.ID)
	if got.PasswordSet || got.PasswordHash == "hash" || !got.EmailVerified {
		t.Fatalf("attacker password must be invalidated: %+v", got)
	}
	if _, _, err := e.sessions.Refresh(ctx, tokens.Refresh, identity.Meta{}); err == nil {
		t.Fatal("attacker refresh token must be revoked")
	}
	claimsOld, _ := e.jwt.Validate(tokens.Access)
	if _, err := e.guard.Check(ctx, claimsOld.UserID, claimsOld.TokenVersion); err == nil {
		t.Fatal("attacker access token must be revoked via token_version")
	}
}

func TestResolveLogin_PrivilegedUnverifiedAccountNeverNeutralisedNorAutoLinked(t *testing.T) {
	e := newEnv()
	e.store.AddUser("admin@example.com", false, "Admin")
	out, err := e.svc.ResolveLogin(ctx, claims("google", "g9", "admin@example.com", true))
	if err != nil || out.Kind != identity.OutcomeLinkRequired {
		t.Fatalf("privileged accounts must require explicit confirmation, got %+v %v", out, err)
	}
}

func TestResolveLogin_DisabledAccountBlocked(t *testing.T) {
	e := newEnv()
	u := e.store.AddUser("x@example.com", true)
	_ = e.store.SetStatus(ctx, u.ID, entity.UserStatusDeactivated)
	if _, err := e.svc.ResolveLogin(ctx, claims("google", "gx", "x@example.com", true)); !errors.Is(err, identity.ErrAccountDisabled) {
		t.Fatalf("want disabled, got %v", err)
	}
}

func TestVerifyToken_SignupEmailCreatesAccountOnlyAfterProofOfMailbox(t *testing.T) {
	e := newEnv()
	out, _ := e.svc.ResolveLogin(ctx, claims("github", "77", "", false))
	if err := e.svc.SubmitSignupEmail(ctx, out.Ticket, "Me@Example.com"); err != nil {
		t.Fatal(err)
	}
	if len(e.store.Users) != 0 {
		t.Fatal("no account before verification")
	}
	var raw string
	for _, tk := range e.store.Tokens {
		if tk.Purpose == entity.EmailTokenSignupConfirm {
			raw = "found"
		}
	}
	if raw == "" {
		t.Fatal("signup confirmation token must exist")
	}
	if err := e.svc.SubmitSignupEmail(ctx, "bogus", "me@example.com"); !errors.Is(err, identity.ErrInvalidTicket) {
		t.Fatalf("bogus ticket must fail, got %v", err)
	}
}

func TestLinkAndUnlinkRules(t *testing.T) {
	e := newEnv()
	social, _ := e.svc.ResolveLogin(ctx, claims("google", "g1", "s@example.com", true))
	uid := social.User.ID

	if err := e.svc.Unlink(ctx, uid, "google"); !errors.Is(err, identity.ErrLastLoginMethod) {
		t.Fatalf("social-only user must not unlink last method, got %v", err)
	}
	if err := e.svc.LinkToUser(ctx, uid, claims("github", "gh1", "s@example.com", true)); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.Unlink(ctx, uid, "google"); err != nil {
		t.Fatalf("unlink with another method must pass: %v", err)
	}
	if err := e.svc.Unlink(ctx, uid, "google"); !errors.Is(err, identity.ErrIdentityNotFound) {
		t.Fatalf("want not found, got %v", err)
	}

	other := e.store.AddUser("other@example.com", true)
	if err := e.svc.LinkToUser(ctx, other.ID, claims("github", "gh1", "o@example.com", true)); !errors.Is(err, identity.ErrIdentityAlreadyLinked) {
		t.Fatalf("provider identity must never be re-assigned, got %v", err)
	}
}

func TestUnlinkAllowedForPasswordUser(t *testing.T) {
	e := newEnv()
	u := e.store.AddUser("pw@example.com", true)
	_ = e.svc.LinkToUser(ctx, u.ID, claims("google", "g5", "pw@example.com", true))
	if err := e.svc.Unlink(ctx, u.ID, "google"); err != nil {
		t.Fatalf("password user may unlink: %v", err)
	}
}

func TestSessionRefreshRotationAndReuseDetection(t *testing.T) {
	e := newEnv()
	u := e.store.AddUser("s@example.com", true)
	_, t1, err := e.sessions.Issue(ctx, u.ID, identity.Meta{}, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	_, t2, err := e.sessions.Refresh(ctx, t1.Refresh, identity.Meta{})
	if err != nil || t2.Refresh == t1.Refresh {
		t.Fatalf("refresh must rotate: %v", err)
	}
	for _, rt := range e.store.Refresh {
		if rt.UsedAt != nil {
			old := time.Now().Add(-time.Minute)
			rt.UsedAt = &old
		}
	}
	if _, _, err := e.sessions.Refresh(ctx, t1.Refresh, identity.Meta{}); !errors.Is(err, identity.ErrRefreshReuse) || !errors.Is(err, identity.ErrInvalidSession) {
		t.Fatal("reused token must be rejected and flagged as reuse")
	}
	if _, _, err := e.sessions.Refresh(ctx, t2.Refresh, identity.Meta{}); !errors.Is(err, identity.ErrInvalidSession) {
		t.Fatal("reuse must revoke the whole family, including the latest token")
	}
}

func TestSessionRefreshConcurrencyGraceDoesNotRevokeFamily(t *testing.T) {
	e := newEnv()
	u := e.store.AddUser("s@example.com", true)
	_, t1, _ := e.sessions.Issue(ctx, u.ID, identity.Meta{}, time.Now())
	_, t2, _ := e.sessions.Refresh(ctx, t1.Refresh, identity.Meta{})
	if _, _, err := e.sessions.Refresh(ctx, t1.Refresh, identity.Meta{}); err == nil {
		t.Fatal("second use must fail")
	}
	if _, _, err := e.sessions.Refresh(ctx, t2.Refresh, identity.Meta{}); err != nil {
		t.Fatalf("immediate double-submit must not kill the new token: %v", err)
	}
}

func TestTokenVersionRevocation(t *testing.T) {
	e := newEnv()
	u := e.store.AddUser("s@example.com", true)
	_, tk, _ := e.sessions.Issue(ctx, u.ID, identity.Meta{}, time.Now())
	c, _ := e.jwt.Validate(tk.Access)
	if _, err := e.guard.Check(ctx, c.UserID, c.TokenVersion); err != nil {
		t.Fatalf("fresh token must pass: %v", err)
	}
	if err := e.sessions.RevokeAll(ctx, u.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := e.guard.Check(ctx, c.UserID, c.TokenVersion); !errors.Is(err, identity.ErrSessionRevoked) {
		t.Fatalf("logout-all must revoke access tokens, got %v", err)
	}
	if _, _, err := e.sessions.Refresh(ctx, tk.Refresh, identity.Meta{}); err == nil {
		t.Fatal("logout-all must revoke refresh tokens")
	}
}

func TestGuardRejectsDeactivatedAndReflectsRoleChange(t *testing.T) {
	e := newEnv()
	u := e.store.AddUser("s@example.com", true)
	info, err := e.guard.Check(ctx, u.ID, 0)
	if err != nil || info.Role != identity.RoleUser {
		t.Fatalf("want user role, got %v %v", info, err)
	}
	e.store.Users[u.ID].Groups = []entity.Group{{Name: "Admin"}}
	e.guard.Invalidate(u.ID)
	if info, _ := e.guard.Check(ctx, u.ID, 0); info == nil || info.Role != identity.RoleAdmin {
		t.Fatal("role must be read fresh, not from the token")
	}
	_ = e.store.SetStatus(ctx, u.ID, entity.UserStatusDeactivated)
	e.guard.Invalidate(u.ID)
	if _, err := e.guard.Check(ctx, u.ID, 1); err == nil {
		t.Fatal("deactivated user must be rejected")
	}
}

func TestRoleFromGroups(t *testing.T) {
	cases := map[string]string{"Admin": "admin", "SuperAdmin": "admin", "master_admin": "admin", "Editor": "user", "Learner": "user"}
	for g, want := range cases {
		if got := identity.RoleFromGroups([]entity.Group{{Name: g}}); got != want {
			t.Errorf("%s: want %s got %s", g, want, got)
		}
	}
	if identity.RoleFromGroups(nil) != "user" {
		t.Error("no groups must be user")
	}
}
