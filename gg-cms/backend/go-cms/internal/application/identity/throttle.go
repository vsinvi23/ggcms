package identity

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

var ErrTooManyAttempts = errors.New("too many failed attempts")

type TooManyAttemptsError struct{ RetryAfter time.Duration }

func (e *TooManyAttemptsError) Error() string { return ErrTooManyAttempts.Error() }
func (e *TooManyAttemptsError) Unwrap() error { return ErrTooManyAttempts }

// LoginThrottle applies exponential lockout per account+IP and, with a higher
// threshold, per account across all IPs. State is in-memory and per instance.
type LoginThrottle struct {
	mu            sync.Mutex
	entries       map[string]*throttleEntry
	ipThreshold   int
	acctThreshold int
	base          time.Duration
	max           time.Duration
	now           func() time.Time
}

type throttleEntry struct {
	fails       int
	lockedUntil time.Time
	last        time.Time
}

const throttleMaxEntries = 50000

func NewLoginThrottle(ipThreshold, acctThreshold int, base, max time.Duration) *LoginThrottle {
	return &LoginThrottle{
		entries: map[string]*throttleEntry{}, ipThreshold: ipThreshold, acctThreshold: acctThreshold,
		base: base, max: max, now: time.Now,
	}
}

func accountKey(identifier string) string {
	sum := sha256.Sum256([]byte(NormalizeEmail(identifier)))
	return hex.EncodeToString(sum[:8])
}

func (t *LoginThrottle) keys(identifier, ip string) (string, string) {
	a := accountKey(identifier)
	return "a:" + a, "i:" + a + "|" + ip
}

// AccountHash is the stable, non-reversible label used in audit records instead of the raw identifier.
func AccountHash(identifier string) string { return accountKey(identifier) }

// Check returns a *TooManyAttemptsError while the account (or account+IP) is locked.
func (t *LoginThrottle) Check(identifier, ip string) error {
	if t == nil {
		return nil
	}
	ak, ik := t.keys(identifier, ip)
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()
	var wait time.Duration
	for _, k := range []string{ak, ik} {
		if e, ok := t.entries[k]; ok && e.lockedUntil.After(now) {
			if d := e.lockedUntil.Sub(now); d > wait {
				wait = d
			}
		}
	}
	if wait > 0 {
		return &TooManyAttemptsError{RetryAfter: wait}
	}
	return nil
}

// Fail records a failed attempt and reports whether it triggered a new lockout.
func (t *LoginThrottle) Fail(identifier, ip string) (locked bool) {
	if t == nil {
		return false
	}
	ak, ik := t.keys(identifier, ip)
	t.mu.Lock()
	defer t.mu.Unlock()
	now := t.now()
	if len(t.entries) > throttleMaxEntries {
		t.purge(now)
	}
	return t.bump(ak, t.acctThreshold, now) || t.bump(ik, t.ipThreshold, now)
}

func (t *LoginThrottle) bump(key string, threshold int, now time.Time) bool {
	e, ok := t.entries[key]
	if !ok || now.Sub(e.last) > t.max*4 {
		e = &throttleEntry{}
		t.entries[key] = e
	}
	e.fails++
	e.last = now
	if e.fails < threshold {
		return false
	}
	shift := e.fails - threshold
	if shift > 16 {
		shift = 16
	}
	d := t.base << uint(shift)
	if d > t.max || d <= 0 {
		d = t.max
	}
	e.lockedUntil = now.Add(d)
	return true
}

// Success clears the account+IP counter and the account-wide counter.
func (t *LoginThrottle) Success(identifier, ip string) {
	if t == nil {
		return
	}
	ak, ik := t.keys(identifier, ip)
	t.mu.Lock()
	delete(t.entries, ak)
	delete(t.entries, ik)
	t.mu.Unlock()
}

func (t *LoginThrottle) purge(now time.Time) {
	for k, e := range t.entries {
		if now.Sub(e.last) > t.max*4 && !e.lockedUntil.After(now) {
			delete(t.entries, k)
		}
	}
}

