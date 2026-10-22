package password

import (
	"errors"
	"strings"
	"testing"
)

func TestValidate(t *testing.T) {
	cases := []struct {
		name  string
		pwd   string
		hints []string
		ok    bool
	}{
		{"strong passphrase", "correct horse battery staple", nil, true},
		{"11 chars rejected", "abcdefgh123", nil, false},
		{"12 chars random accepted", "k3Vz9!qLw2Xp", nil, true},
		{"72 bytes accepted", strings.Repeat("aB3$", 18), nil, true},
		{"73 bytes rejected", strings.Repeat("aB3$", 18) + "x", nil, false},
		{"common list", "password1234", nil, false},
		{"common list case-insensitive", "PassWord1234", nil, false},
		{"common with trailing symbol", "welcome12345!!", nil, false},
		{"all same char", "aaaaaaaaaaaaaa", nil, false},
		{"contains email local part", "johnsmith-is-great!", []string{"johnsmith@example.com"}, false},
		{"contains name", "my name is Alexander ok", []string{"Alexander"}, false},
		{"short hint ignored", "k3Vz9!qLw2Xp-bob", []string{"bob"}, true},
	}
	for _, tc := range cases {
		err := Validate(tc.pwd, tc.hints...)
		if (err == nil) != tc.ok {
			t.Errorf("%s: ok=%v err=%v", tc.name, tc.ok, err)
		}
		if err != nil {
			var pe *PolicyError
			if !errors.As(err, &pe) {
				t.Errorf("%s: error must be *PolicyError", tc.name)
			}
		}
	}
}

func TestDummyCompareAndRandomHash(t *testing.T) {
	DummyCompare("whatever")
	h, err := RandomHash()
	if err != nil || h == "" || Compare(h, "") {
		t.Fatal("random hash must be a valid, unguessable bcrypt hash")
	}
}
