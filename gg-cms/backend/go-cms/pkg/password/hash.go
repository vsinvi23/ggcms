package password

import "golang.org/x/crypto/bcrypt"

const cost = 12

func Hash(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), cost)
	return string(b), err
}

func Compare(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}
