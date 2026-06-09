package settings_test

import (
	"context"
	"errors"
	"testing"

	"github.com/serenya/go-cms/internal/application/settings"
	"github.com/serenya/go-cms/internal/infrastructure/storage"
	"github.com/serenya/go-cms/pkg/config"
)

// mockRepo implements repository.AppSettingsRepository for tests.
type mockRepo struct {
	data map[string]string
	err  error
}

func newMockRepo(data map[string]string) *mockRepo { return &mockRepo{data: data} }

func (m *mockRepo) GetAll(_ context.Context) (map[string]string, error) {
	if m.err != nil {
		return nil, m.err
	}
	out := make(map[string]string, len(m.data))
	for k, v := range m.data {
		out[k] = v
	}
	return out, nil
}

func (m *mockRepo) Set(_ context.Context, key, value string) error {
	if m.err != nil {
		return m.err
	}
	m.data[key] = value
	return nil
}

func (m *mockRepo) SetMany(_ context.Context, s map[string]string) error {
	if m.err != nil {
		return m.err
	}
	for k, v := range s {
		m.data[k] = v
	}
	return nil
}

func testCfg() *config.Config {
	return &config.Config{
		Upload: config.UploadConfig{Dir: "./uploads", BaseURL: "http://localhost:8080/uploads"},
	}
}

func TestGetStorageProvider_Local(t *testing.T) {
	repo := newMockRepo(map[string]string{"storage.provider": "local"})
	svc := settings.NewService(repo, testCfg())

	p, err := svc.GetStorageProvider(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Name() != "local" {
		t.Fatalf("expected local, got %s", p.Name())
	}
}

func TestGetStorageProvider_S3(t *testing.T) {
	repo := newMockRepo(map[string]string{
		"storage.provider":      "s3",
		"storage.s3.bucket":     "my-bucket",
		"storage.s3.region":     "us-east-1",
		"storage.s3.access_key": "AKID",
		"storage.s3.secret_key": "SECRET",
	})
	svc := settings.NewService(repo, testCfg())

	p, err := svc.GetStorageProvider(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Name() != "s3" {
		t.Fatalf("expected s3, got %s", p.Name())
	}
	s3p, ok := p.(*storage.S3Provider)
	if !ok {
		t.Fatal("expected *storage.S3Provider")
	}
	if s3p.Bucket != "my-bucket" {
		t.Errorf("bucket mismatch: got %s", s3p.Bucket)
	}
}

func TestGetStorageProvider_DefaultIsLocal(t *testing.T) {
	repo := newMockRepo(map[string]string{}) // no storage.provider key
	svc := settings.NewService(repo, testCfg())

	p, err := svc.GetStorageProvider(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if p.Name() != "local" {
		t.Fatalf("default should be local, got %s", p.Name())
	}
}

func TestGetStorageProvider_RepoError(t *testing.T) {
	repo := &mockRepo{err: errors.New("db down")}
	svc := settings.NewService(repo, testCfg())

	_, err := svc.GetStorageProvider(context.Background())
	if err == nil {
		t.Fatal("expected error when repo fails")
	}
}

func TestSetMany(t *testing.T) {
	repo := newMockRepo(map[string]string{})
	svc := settings.NewService(repo, testCfg())

	err := svc.SetMany(context.Background(), map[string]string{
		"storage.provider":  "s3",
		"storage.s3.bucket": "new-bucket",
	})
	if err != nil {
		t.Fatalf("SetMany failed: %v", err)
	}
	all, _ := svc.GetAll(context.Background())
	if all["storage.provider"] != "s3" {
		t.Errorf("expected s3, got %s", all["storage.provider"])
	}
}
