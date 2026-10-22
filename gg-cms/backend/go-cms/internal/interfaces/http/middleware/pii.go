package middleware

import (
	"regexp"
	"strings"
)

var emailPattern = regexp.MustCompile(`[A-Za-z0-9._%+\-]+(?:@|%40)[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)

// MaskEmail keeps the first character and the domain: "a***@example.com".
func MaskEmail(e string) string {
	at := strings.LastIndexAny(e, "@")
	if at <= 0 {
		if strings.Contains(e, "%40") {
			return maskEmailsIn(e)
		}
		return e
	}
	return e[:1] + "***" + e[at:]
}

func maskEmailsIn(s string) string {
	return emailPattern.ReplaceAllStringFunc(s, func(m string) string {
		sep := "@"
		i := strings.Index(m, "@")
		if i < 0 {
			sep = "%40"
			i = strings.Index(m, "%40")
		}
		return m[:1] + "***" + sep + m[i+len(sep):]
	})
}
