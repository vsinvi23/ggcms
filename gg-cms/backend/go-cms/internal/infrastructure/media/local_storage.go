package media

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/google/uuid"
	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/pkg/config"
)

type localMediaRepository struct {
	uploadDir string
	baseURL   string
}

func NewLocalMediaRepository(cfg *config.UploadConfig) repository.MediaRepository {
	os.MkdirAll(cfg.Dir, 0755)
	return &localMediaRepository{uploadDir: cfg.Dir, baseURL: cfg.BaseURL}
}

// Save records the file metadata and returns the public URL.
// The actual file writing is done by SaveFile before calling this.
func (r *localMediaRepository) Save(_ context.Context, filename, _ string, _ int64) (string, error) {
	return fmt.Sprintf("%s/%s", r.baseURL, filename), nil
}

// SaveFile writes the file data to disk and returns the generated filename.
func SaveFile(uploadDir string, file io.Reader, originalFilename string) (string, error) {
	ext := filepath.Ext(originalFilename)
	newFilename := uuid.New().String() + ext
	dst := filepath.Join(uploadDir, newFilename)

	f, err := os.Create(dst)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer f.Close()

	if _, err := io.Copy(f, file); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}
	return newFilename, nil
}
