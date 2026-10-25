package password

import (
	"bufio"
	"context"
	"crypto/sha1" // #nosec G505 -- required by the HIBP range API, not used for security
	_ "embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	MinLength = 12
	MaxBytes  = 72
	MaxName   = 100
)

//go:embed common_passwords.txt
var commonRaw string

var common = func() map[string]struct{} {
	m := make(map[string]struct{})
	sc := bufio.NewScanner(strings.NewReader(commonRaw))
	for sc.Scan() {
		if w := strings.ToLower(strings.TrimSpace(sc.Text())); w != "" {
			m[w] = struct{}{}
		}
	}
	return m
}()

var ErrBreached = errors.New("this password has appeared in a known data breach; choose a different one")

// PolicyError carries a message that is safe to show to the user.
type PolicyError struct{ Msg string }

func (e *PolicyError) Error() string { return e.Msg }

// Validate enforces the password policy. hints (email, name) must not be
// contained in the password.
func Validate(pwd string, hints ...string) error {
	if utf8.RuneCountInString(pwd) < MinLength {
		return &PolicyError{fmt.Sprintf("password must be at least %d characters", MinLength)}
	}
	if len(pwd) > MaxBytes {
		return &PolicyError{fmt.Sprintf("password must be at most %d bytes", MaxBytes)}
	}
	lower := strings.ToLower(pwd)
	if _, bad := common[lower]; bad {
		return &PolicyError{"password is too common"}
	}
	for _, variant := range []string{strings.TrimRight(lower, "!@#$%^&*."), strings.TrimRight(lower, "0123456789!@#$%^&*.")} {
		if _, bad := common[variant]; bad {
			return &PolicyError{"password is too common"}
		}
	}
	if strings.Count(lower, string([]rune(lower)[0])) == utf8.RuneCountInString(lower) {
		return &PolicyError{"password is too repetitive"}
	}
	for _, h := range hints {
		h = strings.ToLower(strings.TrimSpace(h))
		if at := strings.Index(h, "@"); at > 0 {
			h = h[:at]
		}
		if len(h) >= 4 && strings.Contains(lower, h) {
			return &PolicyError{"password must not contain your email or name"}
		}
	}
	return nil
}

// CheckBreached queries the HIBP k-anonymity range API. It fails open: any
// network/API error returns nil so an outage never blocks sign-up.
func CheckBreached(ctx context.Context, pwd string) error {
	sum := sha1.Sum([]byte(pwd)) // #nosec G401
	full := strings.ToUpper(hex.EncodeToString(sum[:]))
	prefix, suffix := full[:5], full[5:]

	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.pwnedpasswords.com/range/"+prefix, nil)
	if err != nil {
		return nil
	}
	req.Header.Set("Add-Padding", "true")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil
	}
	for _, line := range strings.Split(string(body), "\n") {
		parts := strings.SplitN(strings.TrimSpace(line), ":", 2)
		if len(parts) == 2 && parts[0] == suffix && strings.TrimSpace(parts[1]) != "0" {
			return ErrBreached
		}
	}
	return nil
}
