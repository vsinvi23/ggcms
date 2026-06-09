package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

// LocalProvider stores files on the local filesystem.
type LocalProvider struct {
	UploadDir string
	BaseURL   string
}

// NewLocalProvider creates a LocalProvider and ensures UploadDir exists.
func NewLocalProvider(uploadDir, baseURL string) *LocalProvider {
	os.MkdirAll(uploadDir, 0755)
	return &LocalProvider{UploadDir: uploadDir, BaseURL: baseURL}
}

func (p *LocalProvider) Name() string { return "local" }

func (p *LocalProvider) Save(file io.Reader, filename string, mimeType string, size int64) (string, string, error) {
	ext := filepath.Ext(filename)
	key := uuid.New().String() + ext
	dst := filepath.Join(p.UploadDir, key)
	f, err := os.Create(dst)
	if err != nil {
		return "", "", fmt.Errorf("create file: %w", err)
	}
	defer f.Close()
	if _, err := io.Copy(f, file); err != nil {
		return "", "", fmt.Errorf("write file: %w", err)
	}
	return key, fmt.Sprintf("%s/%s", p.BaseURL, key), nil
}

func (p *LocalProvider) Delete(key string) error {
	return os.Remove(filepath.Join(p.UploadDir, key))
}
