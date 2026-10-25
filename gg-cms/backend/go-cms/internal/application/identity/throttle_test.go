package identity

import (
	"errors"
	"testing"
	"time"
)

func TestLoginThrottleBackoff(t *testing.T) {
	now := time.Unix(1000, 0)
	th := NewLoginThrottle(3, 5, 10*time.Second, time.Minute)
	th.now = func() time.Time { return now }

	for i := 0; i < 2; i++ {
		if th.Fail("A@x.io", "1.1.1.1") {
			t.Fatalf("attempt %d must not lock", i+1)
		}
	}
	if err := th.Check("a@x.io", "1.1.1.1"); err != nil {
		t.Fatal("not locked yet")
	}
	if !th.Fail("a@x.io", "1.1.1.1") {
		t.Fatal("third failure must lock")
	}
	var tm *TooManyAttemptsError
	err := th.Check("a@x.io", "1.1.1.1")
	if !errors.As(err, &tm) || tm.RetryAfter != 10*time.Second || !errors.Is(err, ErrTooManyAttempts) {
		t.Fatalf("want 10s lock, got %v", err)
	}
	if th.Check("a@x.io", "2.2.2.2") != nil {
		t.Fatal("other IP must not be locked by the account+IP counter")
	}

	now = now.Add(11 * time.Second)
	if th.Check("a@x.io", "1.1.1.1") != nil {
		t.Fatal("lock must expire")
	}
	th.Fail("a@x.io", "1.1.1.1")
	_ = errors.As(th.Check("a@x.io", "1.1.1.1"), &tm)
	if tm.RetryAfter != 20*time.Second {
		t.Fatalf("backoff must double, got %v", tm.RetryAfter)
	}

	th.Success("a@x.io", "1.1.1.1")
	if th.Check("a@x.io", "1.1.1.1") != nil {
		t.Fatal("success must clear lock")
	}
}

func TestLoginThrottleAccountWideAcrossIPs(t *testing.T) {
	th := NewLoginThrottle(3, 5, time.Second, time.Minute)
	for i := 0; i < 5; i++ {
		th.Fail("v@x.io", string(rune('a'+i)))
	}
	if th.Check("v@x.io", "brand-new-ip") == nil {
		t.Fatal("distributed attempts must lock the account")
	}
	if th.Check("other@x.io", "brand-new-ip") != nil {
		t.Fatal("other accounts unaffected")
	}
}

func TestNilThrottleIsNoop(t *testing.T) {
	var th *LoginThrottle
	if th.Check("a", "b") != nil || th.Fail("a", "b") {
		t.Fatal("nil throttle must be a no-op")
	}
	th.Success("a", "b")
}
