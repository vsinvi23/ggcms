// Package identitytest provides in-memory repositories for unit-testing the
// identity, auth and oauth services without a database.
package identitytest

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type Store struct {
	mu       sync.Mutex
	nextID   uint
	Users    map[uint]*entity.User
	Refresh  map[string]*entity.RefreshToken
	Idents   []*entity.UserIdentity
	Txs      map[string]*entity.OAuthTransaction
	Tokens   []*entity.EmailVerificationToken
	Resets   []*entity.PasswordResetToken
	identSeq uint
}

func NewStore() *Store {
	return &Store{
		Users:   map[uint]*entity.User{},
		Refresh: map[string]*entity.RefreshToken{},
		Txs:     map[string]*entity.OAuthTransaction{},
	}
}

func (s *Store) AddUser(email string, verified bool, groups ...string) *entity.User {
	u := &entity.User{
		Email: strings.ToLower(email), PasswordHash: "hash", Name: "N", Status: entity.UserStatusActive,
		EmailVerified: verified, PasswordSet: true,
	}
	for _, g := range groups {
		u.Groups = append(u.Groups, entity.Group{Name: g})
	}
	_ = s.Create(context.Background(), u)
	return u
}

// ── UserRepository ──────────────────────────────────────────────────────────

func (s *Store) Create(_ context.Context, u *entity.User) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nextID++
	u.ID = s.nextID
	u.Email = strings.ToLower(strings.TrimSpace(u.Email))
	cp := *u
	s.Users[u.ID] = &cp
	return nil
}
func (s *Store) Update(_ context.Context, u *entity.User) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cp := *u
	s.Users[u.ID] = &cp
	return nil
}
func (s *Store) Delete(_ context.Context, id uint) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.Users, id)
	return nil
}
func (s *Store) UpdateLastLogin(_ context.Context, id uint, t time.Time) error { return nil }
func (s *Store) SetStatus(_ context.Context, id uint, st entity.UserStatus) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if u, ok := s.Users[id]; ok {
		u.Status = st
		u.TokenVersion++
	}
	return nil
}
func (s *Store) FindByID(_ context.Context, id uint) (*entity.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if u, ok := s.Users[id]; ok {
		cp := *u
		return &cp, nil
	}
	return nil, repository.ErrNotFound
}
func (s *Store) FindByEmail(_ context.Context, email string) (*entity.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	email = strings.ToLower(strings.TrimSpace(email))
	for _, u := range s.Users {
		if u.Email == email {
			cp := *u
			return &cp, nil
		}
	}
	return nil, repository.ErrNotFound
}
func (s *Store) FindAll(_ context.Context, page, size int) ([]*entity.User, int64, error) {
	return nil, 0, nil
}

// ── UserAuthRepository ──────────────────────────────────────────────────────

func (s *Store) SetPassword(_ context.Context, id uint, hash string, set bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u := s.Users[id]
	u.PasswordHash, u.PasswordSet = hash, set
	u.TokenVersion++
	return nil
}
func (s *Store) BumpTokenVersion(_ context.Context, id uint) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Users[id].TokenVersion++
	return nil
}
func (s *Store) MarkEmailVerified(_ context.Context, id uint, at time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Users[id].EmailVerified = true
	return nil
}
func (s *Store) NeutralisePassword(_ context.Context, id uint, hash string, at time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u := s.Users[id]
	u.PasswordHash, u.PasswordSet, u.EmailVerified = hash, false, true
	u.TokenVersion++
	return nil
}
func (s *Store) CreateWithGroup(ctx context.Context, u *entity.User, group string) error {
	u.Groups = []entity.Group{{Name: group}}
	return s.Create(ctx, u)
}

// ── RefreshTokenRepository ──────────────────────────────────────────────────

type refreshRepo struct{ *Store }

func (s *Store) RefreshRepo() repository.RefreshTokenRepository { return refreshRepo{s} }

func (r refreshRepo) Create(_ context.Context, t *entity.RefreshToken) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *t
	r.Refresh[t.ID] = &cp
	return nil
}
func (r refreshRepo) FindByHash(_ context.Context, h string) (*entity.RefreshToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, t := range r.Refresh {
		if t.TokenHash == h {
			cp := *t
			return &cp, nil
		}
	}
	return nil, repository.ErrNotFound
}
func (r refreshRepo) Consume(_ context.Context, id string, at time.Time) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t := r.Refresh[id]
	if t == nil || t.UsedAt != nil || t.RevokedAt != nil {
		return false, nil
	}
	t.UsedAt = &at
	return true, nil
}
func (r refreshRepo) RevokeFamily(_ context.Context, fam string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	for _, t := range r.Refresh {
		if t.FamilyID == fam && t.RevokedAt == nil {
			t.RevokedAt = &now
		}
	}
	return nil
}
func (r refreshRepo) RevokeAllForUser(_ context.Context, uid uint) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	for _, t := range r.Refresh {
		if t.UserID == uid && t.RevokedAt == nil {
			t.RevokedAt = &now
		}
	}
	return nil
}

// ── IdentityRepository ──────────────────────────────────────────────────────

type identRepo struct{ *Store }

func (s *Store) IdentityRepo() repository.IdentityRepository { return identRepo{s} }

func (r identRepo) FindByProvider(_ context.Context, p, pid string) (*entity.UserIdentity, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, i := range r.Idents {
		if i.Provider == p && i.ProviderUserID == pid {
			cp := *i
			return &cp, nil
		}
	}
	return nil, repository.ErrNotFound
}
func (r identRepo) ListByUser(_ context.Context, uid uint) ([]entity.UserIdentity, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []entity.UserIdentity
	for _, i := range r.Idents {
		if i.UserID == uid {
			out = append(out, *i)
		}
	}
	return out, nil
}
func (r identRepo) Create(_ context.Context, i *entity.UserIdentity) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, e := range r.Idents {
		if e.Provider == i.Provider && e.ProviderUserID == i.ProviderUserID {
			return repository.ErrNotFound
		}
	}
	r.identSeq++
	i.ID = r.identSeq
	cp := *i
	r.Idents = append(r.Idents, &cp)
	return nil
}
func (r identRepo) Delete(_ context.Context, uid uint, p string) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for k, i := range r.Idents {
		if i.UserID == uid && i.Provider == p {
			r.Idents = append(r.Idents[:k], r.Idents[k+1:]...)
			return true, nil
		}
	}
	return false, nil
}
func (r identRepo) TouchLogin(_ context.Context, id uint, at time.Time) error { return nil }

// ── OAuthTransactionRepository ──────────────────────────────────────────────

type txRepo struct{ *Store }

func (s *Store) TxRepo() repository.OAuthTransactionRepository { return txRepo{s} }

func (r txRepo) Create(_ context.Context, t *entity.OAuthTransaction) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *t
	r.Txs[t.State] = &cp
	return nil
}
func (r txRepo) Consume(_ context.Context, state string, at time.Time) (*entity.OAuthTransaction, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t := r.Txs[state]
	if t == nil || t.UsedAt != nil || !t.ExpiresAt.After(at) {
		return nil, repository.ErrNotFound
	}
	t.UsedAt = &at
	cp := *t
	return &cp, nil
}

// ── EmailTokenRepository ────────────────────────────────────────────────────

type emailRepo struct{ *Store }

func (s *Store) EmailRepo() repository.EmailTokenRepository { return emailRepo{s} }

func (r emailRepo) Create(_ context.Context, t *entity.EmailVerificationToken) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := *t
	r.Tokens = append(r.Tokens, &cp)
	return nil
}
func (r emailRepo) find(h string, at time.Time, purposes []string) *entity.EmailVerificationToken {
	for _, t := range r.Tokens {
		if t.TokenHash != h || t.UsedAt != nil || !t.ExpiresAt.After(at) {
			continue
		}
		for _, p := range purposes {
			if t.Purpose == p {
				return t
			}
		}
	}
	return nil
}
func (r emailRepo) Consume(_ context.Context, h string, at time.Time, purposes ...string) (*entity.EmailVerificationToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t := r.find(h, at, purposes)
	if t == nil {
		return nil, repository.ErrNotFound
	}
	t.UsedAt = &at
	cp := *t
	return &cp, nil
}
func (r emailRepo) Peek(_ context.Context, h string, at time.Time, purposes ...string) (*entity.EmailVerificationToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t := r.find(h, at, purposes)
	if t == nil {
		return nil, repository.ErrNotFound
	}
	cp := *t
	return &cp, nil
}

// ── PasswordResetTokenRepository ────────────────────────────────────────────

type resetRepo struct{ *Store }

func (s *Store) ResetRepo() repository.PasswordResetTokenRepository { return resetRepo{s} }

func (r resetRepo) Create(_ context.Context, t *entity.PasswordResetToken) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	t.ID = time.Now().Format("150405.000000000")
	cp := *t
	r.Resets = append(r.Resets, &cp)
	return nil
}
func (r resetRepo) FindValidByHash(_ context.Context, h string) (*entity.PasswordResetToken, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, t := range r.Resets {
		if t.TokenHash == h && t.UsedAt == nil && t.ExpiresAt.After(time.Now()) {
			cp := *t
			return &cp, nil
		}
	}
	return nil, repository.ErrNotFound
}
func (r resetRepo) MarkUsed(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, t := range r.Resets {
		if t.ID == id && t.UsedAt == nil {
			now := time.Now()
			t.UsedAt = &now
			return nil
		}
	}
	return repository.ErrNotFound
}
func (r resetRepo) InvalidateForUser(_ context.Context, uid uint) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	for _, t := range r.Resets {
		if t.UserID == uid && t.UsedAt == nil {
			t.UsedAt = &now
		}
	}
	return nil
}

// ── Mail sink ───────────────────────────────────────────────────────────────

type Mail struct {
	mu   sync.Mutex
	Sent []string
}

func (m *Mail) Configured() bool { return true }
func (m *Mail) Send(to, subject, body string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Sent = append(m.Sent, to+"|"+subject)
	return nil
}

func (m *Mail) Count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.Sent)
}
