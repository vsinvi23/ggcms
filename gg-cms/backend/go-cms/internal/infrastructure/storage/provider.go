package storage

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"syscall"
	"time"
)

// Provider is the interface for pluggable file storage backends.
type Provider interface {
	Save(file io.Reader, filename string, mimeType string, size int64) (key string, publicURL string, err error)
	Delete(key string) error
	Name() string
}

// mimeExtensions is the allow-list mapping sniffed MIME types to the only extensions ever stored.
var mimeExtensions = map[string]string{
	"image/png":          ".png",
	"image/jpeg":         ".jpg",
	"image/gif":          ".gif",
	"image/webp":         ".webp",
	"application/pdf":    ".pdf",
	"video/mp4":          ".mp4",
	"video/webm":         ".webm",
	"application/msword": ".doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
	"application/zip": ".zip",
	"text/plain":      ".txt",
}

// ExtensionForMIME returns the allow-listed extension for a MIME type, or ".bin" when unknown.
func ExtensionForMIME(mimeType string) string {
	if idx := strings.Index(mimeType, ";"); idx != -1 {
		mimeType = mimeType[:idx]
	}
	if ext, ok := mimeExtensions[strings.ToLower(strings.TrimSpace(mimeType))]; ok {
		return ext
	}
	return ".bin"
}

func isBlockedIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() || ip.IsMulticast()
}

// ValidateS3Endpoint rejects non-https endpoints and endpoints pointing at private/loopback addresses.
func ValidateS3Endpoint(endpoint string) error {
	if endpoint == "" {
		return nil
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return fmt.Errorf("invalid S3 endpoint")
	}
	if u.Scheme != "https" {
		return fmt.Errorf("S3 endpoint must use https")
	}
	if u.User != nil {
		return fmt.Errorf("S3 endpoint must not contain credentials")
	}
	host := u.Hostname()
	if strings.EqualFold(host, "localhost") || strings.HasSuffix(strings.ToLower(host), ".internal") || strings.HasSuffix(strings.ToLower(host), ".local") {
		return fmt.Errorf("S3 endpoint host is not allowed")
	}
	if ip := net.ParseIP(host); ip != nil && isBlockedIP(ip) {
		return fmt.Errorf("S3 endpoint must not be a private or loopback address")
	}
	return nil
}

func safeHTTPClient(timeout time.Duration) *http.Client {
	dialer := &net.Dialer{
		Timeout: 10 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, err := net.SplitHostPort(address)
			if err != nil {
				return err
			}
			if ip := net.ParseIP(host); ip != nil && isBlockedIP(ip) {
				return fmt.Errorf("connection to private address blocked")
			}
			return nil
		},
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: &http.Transport{DialContext: dialer.DialContext, Proxy: nil},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}
