package storage

import "io"

// Provider is the interface for pluggable file storage backends.
type Provider interface {
	Save(file io.Reader, filename string, mimeType string, size int64) (key string, publicURL string, err error)
	Delete(key string) error
	Name() string
}
