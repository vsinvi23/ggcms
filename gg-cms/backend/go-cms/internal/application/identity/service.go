package identity

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/password"
)

var (
	ErrIdentityAlreadyLinked = errors.New("identity already linked to another account")
	ErrLastLoginMethod       = errors.New("cannot remove the last login method")
	ErrInvalidTicket         = errors.New("invalid or expired ticket")
	ErrInvalidCredentials    = errors.New("invalid credentials")
	ErrEmailUnverified       = errors.New("provider email is not verified")
	ErrInvalidEmail          = errors.New("invalid email")
	ErrIdentityNotFound      = errors.New("identity not linked")
)

const (
	ticketTTL      = 15 * time.Minute
	emailTokenTTL  = 24 * time.Hour
	linkEmailTTL   = 30 * time.Minute
	VerifiedResult = "verified"
	LinkedResult   = "linked"
	SignedUpResult = "signed_up"
)

type Claims struct {
	Provider       string `json:"provider"`
	ProviderUserID string `json:"providerUserId"`
	Email          string `json:"email"`
	EmailVerified  bool   `json:"emailVerified"`
	Name           string `json:"name"`
	AvatarURL      string `json:"avatarUrl"`
}

type OutcomeKind string

const (
	OutcomeLogin        OutcomeKind = "login"
	OutcomeCreated      OutcomeKind = "created"
	OutcomeLinkRequired OutcomeKind = "link_required"
	OutcomeEmailNeeded  OutcomeKind = "email_needed"
)

type Outcome struct {
	Kind   OutcomeKind
	User   *entity.User
	Ticket string
	// Neutralised is true when an unverified local account was taken over by the
	// verified social identity (its password was invalidated).
	Neutralised bool
}

type Service struct {
	users       repository.UserRepository
	userAuth    repository.UserAuthRepository
	identities  repository.IdentityRepository
	emailTokens repository.EmailTokenRepository
	sessions    *Sessions
	notifier    *Notifier
	frontendURL string
}

func NewService(
	users repository.UserRepository,
	userAuth repository.UserAuthRepository,
	identities repository.IdentityRepository,
	emailTokens repository.EmailTokenRepository,
	sessions *Sessions,
	notifier *Notifier,
	frontendURL string,
) *Service {
	return &Service{
		users: users, userAuth: userAuth, identities: identities, emailTokens: emailTokens,
		sessions: sessions, notifier: notifier, frontendURL: strings.TrimRight(frontendURL, "/"),
	}
}

func NormalizeEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

func validEmail(e string) bool {
	a, err := mail.ParseAddress(e)
	return err == nil && a.Address == e && len(e) <= 254
}

func (s *Service) link(path, query string) string {
	return fmt.Sprintf("%s%s?%s", s.frontendURL, path, query)
}

// ResolveLogin applies the linking rules. Identity lookup is by
// (provider, provider_user_id) only; email is used solely to decide whether to
// create an account or to require an explicit link confirmation.
func (s *Service) ResolveLogin(ctx context.Context, c Claims) (*Outcome, error) {
	c.Email = NormalizeEmail(c.Email)

	ident, err := s.identities.FindByProvider(ctx, c.Provider, c.ProviderUserID)
	switch {
	case err == nil:
		u, uerr := s.users.FindByID(ctx, ident.UserID)
		if uerr != nil {
			return nil, uerr
		}
		if !IsActive(u.Status) {
			return nil, ErrAccountDisabled
		}
		_ = s.identities.TouchLogin(ctx, ident.ID, time.Now())
		return &Outcome{Kind: OutcomeLogin, User: u}, nil
	case !errors.Is(err, repository.ErrNotFound):
		return nil, err
	}

	if c.Email == "" {
		ticket, terr := s.createTicket(ctx, entity.EmailTokenSignupTicket, nil, c)
		if terr != nil {
			return nil, terr
		}
		return &Outcome{Kind: OutcomeEmailNeeded, Ticket: ticket}, nil
	}
	if !c.EmailVerified {
		return nil, ErrEmailUnverified
	}

	existing, err := s.users.FindByEmail(ctx, c.Email)
	if err != nil {
		if !errors.Is(err, repository.ErrNotFound) {
			return nil, err
		}
		u, cerr := s.createUser(ctx, c)
		if cerr != nil {
			return nil, cerr
		}
		return &Outcome{Kind: OutcomeCreated, User: u}, nil
	}
	if !IsActive(existing.Status) {
		return nil, ErrAccountDisabled
	}

	if !existing.EmailVerified && !IsPrivileged(existing.Groups) {
		u, aerr := s.attachVerified(ctx, existing, c)
		if aerr != nil {
			return nil, aerr
		}
		return &Outcome{Kind: OutcomeLogin, User: u, Neutralised: true}, nil
	}

	ticket, err := s.createTicket(ctx, entity.EmailTokenLinkTicket, &existing.ID, c)
	if err != nil {
		return nil, err
	}
	return &Outcome{Kind: OutcomeLinkRequired, User: existing, Ticket: ticket}, nil
}

func (s *Service) createUser(ctx context.Context, c Claims) (*entity.User, error) {
	hash, err := password.RandomHash()
	if err != nil {
		return nil, err
	}
	now := time.Now()
	u := &entity.User{
		Email:           c.Email,
		PasswordHash:    hash,
		Name:            displayName(c),
		Status:          entity.UserStatusActive,
		EmailVerified:   true,
		EmailVerifiedAt: &now,
		PasswordSet:     false,
	}
	if c.AvatarURL != "" {
		u.AvatarURL = &c.AvatarURL
	}
	if err := s.userAuth.CreateWithGroup(ctx, u, LearnerGroup); err != nil {
		return nil, fmt.Errorf("create social user: %w", err)
	}
	if err := s.createIdentity(ctx, u.ID, c); err != nil {
		return nil, err
	}
	return u, nil
}

func displayName(c Claims) string {
	name := strings.TrimSpace(c.Name)
	if name == "" {
		name = strings.Split(c.Email, "@")[0]
	}
	if r := []rune(name); len(r) > password.MaxName {
		name = string(r[:password.MaxName])
	}
	return name
}

func (s *Service) createIdentity(ctx context.Context, userID uint, c Claims) error {
	now := time.Now()
	return s.identities.Create(ctx, &entity.UserIdentity{
		UserID: userID, Provider: c.Provider, ProviderUserID: c.ProviderUserID,
		ProviderEmail: c.Email, EmailVerified: c.EmailVerified, DisplayName: c.Name,
		AvatarURL: c.AvatarURL, LinkedAt: now, LastLoginAt: &now,
	})
}

// attachVerified links the identity to an existing account after proof of mailbox
// ownership. An unverified, unprivileged local account is untrusted (a possible
// pre-hijack): its password is invalidated and all its sessions revoked.
func (s *Service) attachVerified(ctx context.Context, u *entity.User, c Claims) (*entity.User, error) {
	if existing, err := s.identities.FindByProvider(ctx, c.Provider, c.ProviderUserID); err == nil {
		if existing.UserID != u.ID {
			return nil, ErrIdentityAlreadyLinked
		}
	} else if !errors.Is(err, repository.ErrNotFound) {
		return nil, err
	} else if err := s.createIdentity(ctx, u.ID, c); err != nil {
		return nil, err
	}

	if !u.EmailVerified {
		if !IsPrivileged(u.Groups) {
			hash, err := password.RandomHash()
			if err != nil {
				return nil, err
			}
			if err := s.userAuth.NeutralisePassword(ctx, u.ID, hash, time.Now()); err != nil {
				return nil, err
			}
			if err := s.sessions.RevokeAll(ctx, u.ID); err != nil {
				return nil, err
			}
		} else if err := s.userAuth.MarkEmailVerified(ctx, u.ID, time.Now()); err != nil {
			return nil, err
		}
	}
	s.sessions.guard.Invalidate(u.ID)
	s.notifier.Send(u.Email, "A sign-in method was linked to your account",
		fmt.Sprintf("%s was linked to your account. If this wasn't you, reset your password immediately.", providerLabel(c.Provider)))
	return s.users.FindByID(ctx, u.ID)
}

func providerLabel(p string) string {
	switch p {
	case "google":
		return "Google"
	case "github":
		return "GitHub"
	case "linkedin":
		return "LinkedIn"
	}
	return p
}

func (s *Service) createTicket(ctx context.Context, purpose string, userID *uint, c Claims) (string, error) {
	raw, err := RandomToken(32)
	if err != nil {
		return "", err
	}
	pending, _ := json.Marshal(c)
	p := string(pending)
	err = s.emailTokens.Create(ctx, &entity.EmailVerificationToken{
		UserID: userID, Email: c.Email, TokenHash: HashToken(raw), Purpose: purpose,
		PendingIdentity: &p, ExpiresAt: time.Now().Add(ticketTTL),
	})
	return raw, err
}

func pendingClaims(t *entity.EmailVerificationToken) (Claims, error) {
	var c Claims
	if t.PendingIdentity == nil {
		return c, ErrInvalidTicket
	}
	if err := json.Unmarshal([]byte(*t.PendingIdentity), &c); err != nil {
		return c, ErrInvalidTicket
	}
	return c, nil
}

// LinkToUser attaches a provider identity to the signed-in user (intent=link).
func (s *Service) LinkToUser(ctx context.Context, userID uint, c Claims) error {
	if existing, err := s.identities.FindByProvider(ctx, c.Provider, c.ProviderUserID); err == nil {
		if existing.UserID == userID {
			return nil
		}
		return ErrIdentityAlreadyLinked
	} else if !errors.Is(err, repository.ErrNotFound) {
		return err
	}
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	if err := s.createIdentity(ctx, userID, c); err != nil {
		return err
	}
	s.notifier.Send(u.Email, "A sign-in method was linked to your account",
		fmt.Sprintf("%s was linked to your account. If this wasn't you, reset your password immediately.", providerLabel(c.Provider)))
	return nil
}

// Unlink removes a provider identity, refusing to remove the last login method.
func (s *Service) Unlink(ctx context.Context, userID uint, provider string) error {
	u, err := s.users.FindByID(ctx, userID)
	if err != nil {
		return err
	}
	idents, err := s.identities.ListByUser(ctx, userID)
	if err != nil {
		return err
	}
	found := false
	for _, i := range idents {
		if i.Provider == provider {
			found = true
		}
	}
	if !found {
		return ErrIdentityNotFound
	}
	if !u.PasswordSet && len(idents) <= 1 {
		return ErrLastLoginMethod
	}
	if _, err := s.identities.Delete(ctx, userID, provider); err != nil {
		return err
	}
	return s.sessions.RevokeAll(ctx, userID)
}

func (s *Service) ListIdentities(ctx context.Context, userID uint) ([]entity.UserIdentity, error) {
	return s.identities.ListByUser(ctx, userID)
}

// ConfirmLinkWithPassword completes a link_required flow by proving knowledge of
// the local account password.
func (s *Service) ConfirmLinkWithPassword(ctx context.Context, ticket, pwd string) (*entity.User, error) {
	hash := HashToken(ticket)
	t, err := s.emailTokens.Peek(ctx, hash, time.Now(), entity.EmailTokenLinkTicket)
	if err != nil || t.UserID == nil {
		password.DummyCompare(pwd)
		return nil, ErrInvalidTicket
	}
	u, err := s.users.FindByID(ctx, *t.UserID)
	if err != nil || !u.PasswordSet || !password.Compare(u.PasswordHash, pwd) {
		if err != nil || !u.PasswordSet {
			password.DummyCompare(pwd)
		}
		return nil, ErrInvalidCredentials
	}
	if !IsActive(u.Status) {
		return nil, ErrAccountDisabled
	}
	c, err := pendingClaims(t)
	if err != nil {
		return nil, err
	}
	if _, err := s.emailTokens.Consume(ctx, hash, time.Now(), entity.EmailTokenLinkTicket); err != nil {
		return nil, ErrInvalidTicket
	}
	if !u.EmailVerified {
		_ = s.userAuth.MarkEmailVerified(ctx, u.ID, time.Now())
		u.EmailVerified = true
	}
	return s.attachVerified(ctx, u, c)
}

// SendLinkEmail emails the account owner a one-time link that completes the link.
func (s *Service) SendLinkEmail(ctx context.Context, ticket string) error {
	t, err := s.emailTokens.Peek(ctx, HashToken(ticket), time.Now(), entity.EmailTokenLinkTicket)
	if err != nil || t.UserID == nil {
		return ErrInvalidTicket
	}
	c, err := pendingClaims(t)
	if err != nil {
		return err
	}
	u, err := s.users.FindByID(ctx, *t.UserID)
	if err != nil {
		return ErrInvalidTicket
	}
	raw, err := s.createToken(ctx, entity.EmailTokenConfirmLink, &u.ID, u.Email, &c, linkEmailTTL)
	if err != nil {
		return err
	}
	s.notifier.Send(u.Email, "Confirm linking your account",
		fmt.Sprintf("Someone signed in with %s using your email address. To link it to your account, open:\n\n%s\n\nThis link expires in 30 minutes. If this wasn't you, ignore this message.",
			providerLabel(c.Provider), s.link("/auth/callback", "status=verify&token="+raw)))
	return nil
}

// SubmitSignupEmail records the email a social user without a verified provider
// email wants to use, and mails a verification link. The response must not reveal
// whether the address is already registered.
func (s *Service) SubmitSignupEmail(ctx context.Context, ticket, email string) error {
	t, err := s.emailTokens.Peek(ctx, HashToken(ticket), time.Now(), entity.EmailTokenSignupTicket)
	if err != nil {
		return ErrInvalidTicket
	}
	email = NormalizeEmail(email)
	if !validEmail(email) {
		return ErrInvalidEmail
	}
	c, err := pendingClaims(t)
	if err != nil {
		return err
	}
	c.Email = email
	raw, err := s.createToken(ctx, entity.EmailTokenSignupConfirm, nil, email, &c, emailTokenTTL)
	if err != nil {
		return err
	}
	s.notifier.Send(email, "Verify your email",
		fmt.Sprintf("Confirm this email address to finish signing in with %s:\n\n%s\n\nThis link expires in 24 hours.",
			providerLabel(c.Provider), s.link("/auth/callback", "status=verify&token="+raw)))
	return nil
}

func (s *Service) createToken(ctx context.Context, purpose string, userID *uint, email string, c *Claims, ttl time.Duration) (string, error) {
	raw, err := RandomToken(32)
	if err != nil {
		return "", err
	}
	t := &entity.EmailVerificationToken{
		UserID: userID, Email: email, TokenHash: HashToken(raw), Purpose: purpose,
		ExpiresAt: time.Now().Add(ttl),
	}
	if c != nil {
		b, _ := json.Marshal(c)
		p := string(b)
		t.PendingIdentity = &p
	}
	if err := s.emailTokens.Create(ctx, t); err != nil {
		return "", err
	}
	return raw, nil
}

// SendVerification mails an email-verification link to the user.
func (s *Service) SendVerification(ctx context.Context, u *entity.User) error {
	if u.EmailVerified {
		return nil
	}
	raw, err := s.createToken(ctx, entity.EmailTokenVerify, &u.ID, u.Email, nil, emailTokenTTL)
	if err != nil {
		return err
	}
	s.notifier.Send(u.Email, "Verify your email",
		fmt.Sprintf("Confirm your email address:\n\n%s\n\nThis link expires in 24 hours.", s.link("/auth/callback", "status=verify&token="+raw)))
	return nil
}

// VerifyToken consumes an emailed token. Kind tells the caller whether the
// outcome signs the user in (linked / signed_up) or only confirms the address.
func (s *Service) VerifyToken(ctx context.Context, token string) (string, *entity.User, error) {
	t, err := s.emailTokens.Consume(ctx, HashToken(token), time.Now(),
		entity.EmailTokenVerify, entity.EmailTokenConfirmLink, entity.EmailTokenSignupConfirm)
	if err != nil {
		return "", nil, ErrInvalidTicket
	}
	switch t.Purpose {
	case entity.EmailTokenVerify:
		if t.UserID == nil {
			return "", nil, ErrInvalidTicket
		}
		u, err := s.users.FindByID(ctx, *t.UserID)
		if err != nil || NormalizeEmail(u.Email) != NormalizeEmail(t.Email) {
			return "", nil, ErrInvalidTicket
		}
		if err := s.userAuth.MarkEmailVerified(ctx, u.ID, time.Now()); err != nil {
			return "", nil, err
		}
		s.sessions.guard.Invalidate(u.ID)
		u.EmailVerified = true
		return VerifiedResult, u, nil

	case entity.EmailTokenConfirmLink:
		c, err := pendingClaims(t)
		if err != nil || t.UserID == nil {
			return "", nil, ErrInvalidTicket
		}
		u, err := s.users.FindByID(ctx, *t.UserID)
		if err != nil {
			return "", nil, ErrInvalidTicket
		}
		if !IsActive(u.Status) {
			return "", nil, ErrAccountDisabled
		}
		u, err = s.attachVerified(ctx, u, c)
		return LinkedResult, u, err

	default:
		c, err := pendingClaims(t)
		if err != nil {
			return "", nil, err
		}
		c.Email = NormalizeEmail(t.Email)
		existing, err := s.users.FindByEmail(ctx, c.Email)
		if err != nil {
			if !errors.Is(err, repository.ErrNotFound) {
				return "", nil, err
			}
			u, cerr := s.createUser(ctx, c)
			return SignedUpResult, u, cerr
		}
		if !IsActive(existing.Status) {
			return "", nil, ErrAccountDisabled
		}
		u, err := s.attachVerified(ctx, existing, c)
		return LinkedResult, u, err
	}
}
