package analytics

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"math"
	"net"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

const (
	EventPageView          = "page_view"
	EventArticleRead       = "article_read"
	EventSearch            = "search"
	EventCourseEnrolled    = "course_enrolled"
	EventLessonCompleted   = "lesson_completed"
	EventCourseCompleted   = "course_completed"
	EventQuizAttempted     = "quiz_attempted"
	EventRecImpression     = "rec_impression"
	EventRecClick          = "rec_click"
	EventCertificateIssued = "certificate_issued"
	EventAITutorQuestion   = "ai_tutor_question"
)

var (
	ErrUnknownEventType = errors.New("unknown event type")
	ErrInvalidMetadata  = errors.New("invalid metadata")
)

type fieldKind int

const (
	kindString fieldKind = iota
	kindInt
	kindBool
	kindHex
)

type fieldSpec struct {
	kind fieldKind
	max  int
	min  int64
	maxN int64
}

type eventSpec struct {
	public       bool
	needsContent bool
	fields       map[string]fieldSpec
}

var eventSpecs = map[string]eventSpec{
	EventPageView: {public: true, needsContent: true, fields: map[string]fieldSpec{
		"referrer_host": {kind: kindString, max: 100},
		"path":          {kind: kindString, max: 200},
	}},
	EventArticleRead: {public: true, needsContent: true, fields: map[string]fieldSpec{
		"read_seconds": {kind: kindInt, min: 0, maxN: 86400},
		"scroll_pct":   {kind: kindInt, min: 0, maxN: 100},
	}},
	EventSearch: {public: true, fields: map[string]fieldSpec{
		"query_hash":   {kind: kindHex, max: 64},
		"query_text":   {kind: kindString, max: 200},
		"result_count": {kind: kindInt, min: 0, maxN: 1000000},
	}},
	EventCourseEnrolled: {needsContent: true, fields: map[string]fieldSpec{
		"reenroll": {kind: kindBool},
		"source":   {kind: kindString, max: 32},
	}},
	EventLessonCompleted: {needsContent: true, fields: map[string]fieldSpec{
		"lesson_id": {kind: kindString, max: 64},
		"count":     {kind: kindInt, min: 0, maxN: 100000},
		"source":    {kind: kindString, max: 32},
	}},
	EventCourseCompleted: {needsContent: true, fields: map[string]fieldSpec{}},
	EventQuizAttempted: {needsContent: true, fields: map[string]fieldSpec{
		"quiz_id":    {kind: kindString, max: 64},
		"attempt_id": {kind: kindString, max: 64},
		"score_pct":  {kind: kindInt, min: 0, maxN: 100},
		"passed":     {kind: kindBool},
	}},
	EventAITutorQuestion: {needsContent: true, fields: map[string]fieldSpec{"grounded": {kind: kindBool}}},
	EventRecImpression:   {public: true, needsContent: true, fields: recFields},
	EventRecClick:        {public: true, needsContent: true, fields: recFields},
	EventCertificateIssued: {needsContent: true, fields: map[string]fieldSpec{
		"certificate_id": {kind: kindString, max: 64},
	}},
}

var recFields = map[string]fieldSpec{
	"rec_id":   {kind: kindString, max: 64},
	"position": {kind: kindInt, min: 0, maxN: 1000},
	"variant":  {kind: kindString, max: 32},
}

var (
	idPattern      = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
	contentPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]{1,64}$`)
	hexPattern     = regexp.MustCompile(`^[0-9a-f]+$`)
	emailPattern   = regexp.MustCompile(`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`)
	longNumPattern = regexp.MustCompile(`\d{6,}`)
	secretPattern  = regexp.MustCompile(`[A-Za-z0-9_-]{24,}`)
)

var validContentTypes = map[string]bool{"article": true, "course": true, "lesson": true, "path": true}

func cleanString(s string, max int) string {
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, strings.TrimSpace(s))
	if r := []rune(s); len(r) > max {
		s = string(r[:max])
	}
	return s
}

func toInt(v interface{}) (int64, bool) {
	switch n := v.(type) {
	case float64:
		if n != float64(int64(n)) {
			return 0, false
		}
		return int64(n), true
	case int:
		return int64(n), true
	case int32:
		return int64(n), true
	case int64:
		return n, true
	case uint:
		return int64(n), true
	}
	return 0, false
}

func sanitizeMetadata(eventType string, meta map[string]interface{}, consent bool, salt []byte) (map[string]interface{}, error) {
	spec, ok := eventSpecs[eventType]
	if !ok {
		return nil, ErrUnknownEventType
	}
	meta = normaliseMeta(meta)
	out := map[string]interface{}{}
	for key, fs := range spec.fields {
		raw, present := meta[key]
		if !present || raw == nil {
			continue
		}
		switch fs.kind {
		case kindString:
			s, ok := raw.(string)
			if n, isNum := toInt(raw); !ok && isNum {
				s, ok = strconv.FormatInt(n, 10), true
			}
			if !ok {
				return nil, ErrInvalidMetadata
			}
			if s = cleanString(s, fs.max); s != "" {
				out[key] = s
			}
		case kindHex:
			s, ok := raw.(string)
			s = strings.ToLower(s)
			if !ok || len(s) > fs.max || !hexPattern.MatchString(s) {
				return nil, ErrInvalidMetadata
			}
			out[key] = s
		case kindInt:
			n, ok := toInt(raw)
			if !ok || n < fs.min || n > fs.maxN {
				return nil, ErrInvalidMetadata
			}
			out[key] = n
		case kindBool:
			b, ok := raw.(bool)
			if !ok {
				return nil, ErrInvalidMetadata
			}
			out[key] = b
		}
	}
	if eventType == EventSearch {
		text, _ := out["query_text"].(string)
		delete(out, "query_text")
		if norm := normaliseQuery(text); norm != "" {
			out["query_hash"] = hashValue(salt, norm)[:32]
			if consent {
				out["query_text"] = redactQuery(norm)
			}
		}
		if _, ok := out["query_hash"]; !ok {
			return nil, ErrInvalidMetadata
		}
		if _, ok := out["result_count"]; !ok {
			return nil, ErrInvalidMetadata
		}
	}
	return out, nil
}

// normaliseMeta converts camelCase keys to snake_case and maps a fractional "score" to score_pct.
func normaliseMeta(meta map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(meta))
	for k, v := range meta {
		out[snakeCase(k)] = v
	}
	if f, ok := out["score"].(float64); ok {
		if _, has := out["score_pct"]; !has {
			out["score_pct"] = int64(math.Round(f))
		}
	}
	return out
}

func snakeCase(s string) string {
	var b strings.Builder
	for i, r := range s {
		if unicode.IsUpper(r) {
			if i > 0 {
				b.WriteByte('_')
			}
			r = unicode.ToLower(r)
		}
		b.WriteRune(r)
	}
	return b.String()
}

// normaliseContentType lower-cases the type and folds assessments into courses.
func normaliseContentType(t string) string {
	t = strings.ToLower(strings.TrimSpace(t))
	if t == "assessment" {
		return "course"
	}
	return t
}

func normaliseQuery(q string) string {
	return strings.ToLower(strings.Join(strings.Fields(cleanString(q, 200)), " "))
}

func redactQuery(q string) string {
	q = emailPattern.ReplaceAllString(q, "[email]")
	q = longNumPattern.ReplaceAllString(q, "[num]")
	q = secretPattern.ReplaceAllString(q, "[redacted]")
	return cleanString(q, 100)
}

func hashValue(salt []byte, v string) string {
	m := hmac.New(sha256.New, salt)
	m.Write([]byte(v))
	return hex.EncodeToString(m.Sum(nil))
}

// hashIP truncates the address (IPv4 /24, IPv6 /48) and returns a keyed 16-hex-char digest.
func hashIP(salt []byte, ip string) string {
	parsed := net.ParseIP(strings.TrimSpace(ip))
	if parsed == nil {
		return ""
	}
	if v4 := parsed.To4(); v4 != nil {
		return hashValue(salt, v4.Mask(net.CIDRMask(24, 32)).String())[:16]
	}
	return hashValue(salt, parsed.Mask(net.CIDRMask(48, 128)).String())[:16]
}

var botMarkers = []string{
	"bot", "crawl", "spider", "slurp", "curl/", "wget", "python-requests", "python-urllib", "go-http-client",
	"headless", "lighthouse", "phantomjs", "httpclient", "okhttp", "java/", "libwww", "scrapy", "monitor",
	"uptime", "pingdom", "facebookexternalhit", "preview", "axios/", "node-fetch", "postmanruntime",
}

// IsBot reports whether the user agent is empty or looks automated.
func IsBot(ua string) bool {
	ua = strings.ToLower(strings.TrimSpace(ua))
	if len(ua) < 10 {
		return true
	}
	for _, m := range botMarkers {
		if strings.Contains(ua, m) {
			return true
		}
	}
	return false
}
