package ai

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"unicode/utf8"
)

var (
	emailRe     = regexp.MustCompile(`[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}`)
	phoneRe     = regexp.MustCompile(`\+?\d[\d\s().\-]{8,}\d`)
	delimiterRe = regexp.MustCompile(`(?i)<\s*/?\s*untrusted_data`)
	labelRe     = regexp.MustCompile(`[^A-Za-z0-9_ .:\-]`)
	imageRe     = regexp.MustCompile(`!\[([^\]]*)\]\(([^)\s]*)[^)]*\)`)
	mdLinkRe    = regexp.MustCompile(`\[([^\]]*)\]\(([^)\s]*)[^)]*\)`)
	bareURLRe   = regexp.MustCompile(`https?://[^\s"'<>)\]\\]+`)
	htmlTagRe   = regexp.MustCompile(`(?is)<\s*(script|iframe|object|embed|img|style|link|svg|form)\b[^>]*>(.*?</\s*(script|iframe|object|embed|style|svg|form)\s*>)?`)
	fenceRe     = regexp.MustCompile(`(?s)^\s*` + "```" + `[a-zA-Z]*\s*(.*?)\s*` + "```" + `\s*$`)
)

func RedactPII(s string) string {
	s = emailRe.ReplaceAllString(s, "[email]")
	return phoneRe.ReplaceAllStringFunc(s, func(m string) string {
		digits := 0
		for _, r := range m {
			if r >= '0' && r <= '9' {
				digits++
			}
		}
		if digits >= 10 && digits <= 15 {
			return "[phone]"
		}
		return m
	})
}

func WrapUntrusted(label, text string) string {
	label = labelRe.ReplaceAllString(label, "")
	text = delimiterRe.ReplaceAllString(text, "[untrusted")
	return fmt.Sprintf("<untrusted_data label=%q>\n%s\n</untrusted_data>", label, text)
}

func hostAllowed(raw string, allowed []string) bool {
	if strings.HasPrefix(raw, "#") || (strings.HasPrefix(raw, "/") && !strings.HasPrefix(raw, "//")) {
		return true
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, a := range allowed {
		if host == a {
			return true
		}
	}
	return false
}

func NeutraliseLinks(s string, allowed []string) string {
	s = htmlTagRe.ReplaceAllString(s, "")
	s = imageRe.ReplaceAllString(s, "$1")
	s = mdLinkRe.ReplaceAllStringFunc(s, func(m string) string {
		sub := mdLinkRe.FindStringSubmatch(m)
		if hostAllowed(sub[2], allowed) {
			return m
		}
		return sub[1]
	})
	return bareURLRe.ReplaceAllStringFunc(s, func(m string) string {
		if hostAllowed(m, allowed) {
			return m
		}
		return "[link removed]"
	})
}

func Clip(s string, max int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	r := []rune(s)
	cut := string(r[:max])
	if i := strings.LastIndexAny(cut, " \n"); i > max/2 {
		cut = cut[:i]
	}
	return strings.TrimSpace(cut)
}

func ParseJSON(text string, v any) error {
	text = strings.TrimSpace(text)
	if m := fenceRe.FindStringSubmatch(text); m != nil {
		text = m[1]
	}
	start := strings.IndexAny(text, "{[")
	if start < 0 {
		return ErrBadOutput
	}
	closer := "}"
	if text[start] == '[' {
		closer = "]"
	}
	end := strings.LastIndex(text, closer)
	if end < start {
		return ErrBadOutput
	}
	if err := json.Unmarshal([]byte(text[start:end+1]), v); err != nil {
		return ErrBadOutput
	}
	return nil
}
