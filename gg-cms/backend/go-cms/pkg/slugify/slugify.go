package slugify

import (
	"strings"
	"unicode"
)

// Slug converts a title string into a URL-friendly slug.
// e.g. "Go Test Article for Programming!" → "go-test-article-for-programming"
func Slug(title string) string {
	var b strings.Builder
	prevDash := true // start true so we don't begin with a dash
	for _, r := range strings.ToLower(title) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			prevDash = false
		} else if !prevDash {
			b.WriteRune('-')
			prevDash = true
		}
	}
	result := strings.TrimRight(b.String(), "-")
	return result
}
