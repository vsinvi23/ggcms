package settings

import (
	"context"
	"strings"

	"github.com/serenya/go-cms/internal/domain/repository"
	"github.com/serenya/go-cms/internal/infrastructure/storage"
	"github.com/serenya/go-cms/pkg/config"
)

type Service interface {
	GetAll(ctx context.Context) (map[string]string, error)
	Set(ctx context.Context, key, value string) error
	SetMany(ctx context.Context, settings map[string]string) error
	GetStorageProvider(ctx context.Context) (storage.Provider, error)
}

type service struct {
	repo repository.AppSettingsRepository
	cfg  *config.Config
}

func NewService(repo repository.AppSettingsRepository, cfg *config.Config) Service {
	return &service{repo: repo, cfg: cfg}
}

func (s *service) GetAll(ctx context.Context) (map[string]string, error) {
	return s.repo.GetAll(ctx)
}

func (s *service) Set(ctx context.Context, key, value string) error {
	return s.repo.Set(ctx, key, value)
}

func (s *service) SetMany(ctx context.Context, settings map[string]string) error {
	return s.repo.SetMany(ctx, settings)
}

func (s *service) GetStorageProvider(ctx context.Context) (storage.Provider, error) {
	all, err := s.repo.GetAll(ctx)
	if err != nil {
		return nil, err
	}

	provider := strings.ToLower(all["storage.provider"])
	if provider == "" {
		provider = "local"
	}

	switch provider {
	case "s3":
		return &storage.S3Provider{
			Bucket:    all["storage.s3.bucket"],
			Region:    all["storage.s3.region"],
			AccessKey: all["storage.s3.access_key"],
			SecretKey: all["storage.s3.secret_key"],
			Endpoint:  all["storage.s3.endpoint"],
			PublicURL: all["storage.s3.public_url"],
		}, nil
	default:
		uploadDir := all["storage.local.upload_dir"]
		baseURL := all["storage.local.base_url"]
		if uploadDir == "" {
			uploadDir = s.cfg.Upload.Dir
		}
		if baseURL == "" {
			baseURL = s.cfg.Upload.BaseURL
		}
		return storage.NewLocalProvider(uploadDir, baseURL), nil
	}
}
