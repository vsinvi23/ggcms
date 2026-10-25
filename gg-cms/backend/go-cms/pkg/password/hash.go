package password

import (
	"crypto/rand"
	"encoding/hex"
	"sync"

	"golang.org/x/crypto/bcrypt"
)

const cost = 12

var (
	dummyOnce sync.Once
	dummyHash string
)

func Hash(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), cost)
	return string(b), err
}

func Compare(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// DummyCompare burns the same CPU as a real bcrypt comparison so unknown
// accounts are indistinguishable from wrong passwords by timing.
func DummyCompare(plain string) {
	dummyOnce.Do(func() {
		b := make([]byte, 16)
		_, _ = rand.Read(b)
		dummyHash, _ = Hash(hex.EncodeToString(b))
	})
	_ = Compare(dummyHash, plain)
}

// RandomHash returns a bcrypt hash of a random secret nobody knows, used for
// accounts that have no usable local password.
func RandomHash() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return Hash(hex.EncodeToString(b))
}
