package storage_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/serenya/go-cms/internal/infrastructure/storage"
)

func TestLocalProvider_Save(t *testing.T) {
	dir := t.TempDir()
	p := storage.NewLocalProvider(dir, "http://localhost/uploads")

	content := strings.NewReader("hello world")
	key, url, err := p.Save(content, "test.txt", "text/plain", 11)
	if err != nil {
		t.Fatalf("Save() error: %v", err)
	}
	if key == "" {
		t.Fatal("key should not be empty")
	}
	if !strings.HasSuffix(key, ".txt") {
		t.Errorf("key should keep extension, got %s", key)
	}
	if !strings.HasPrefix(url, "http://localhost/uploads/") {
		t.Errorf("unexpected url: %s", url)
	}
	// File should exist on disk
	if _, err := os.Stat(filepath.Join(dir, key)); err != nil {
		t.Errorf("file not found: %v", err)
	}
}

func TestLocalProvider_Delete(t *testing.T) {
	dir := t.TempDir()
	p := storage.NewLocalProvider(dir, "http://localhost/uploads")

	key, _, err := p.Save(strings.NewReader("data"), "del.txt", "text/plain", 4)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if err := p.Delete(key); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, key)); !os.IsNotExist(err) {
		t.Fatal("file should be deleted")
	}
}

func TestLocalProvider_Name(t *testing.T) {
	p := storage.NewLocalProvider(t.TempDir(), "http://x")
	if p.Name() != "local" {
		t.Errorf("expected 'local', got %s", p.Name())
	}
}

func TestS3Provider_Name(t *testing.T) {
	p := &storage.S3Provider{}
	if p.Name() != "s3" {
		t.Errorf("expected 's3', got %s", p.Name())
	}
}

func TestS3Provider_SaveMissingConfig(t *testing.T) {
	p := &storage.S3Provider{} // no bucket/key configured
	_, _, err := p.Save(strings.NewReader("data"), "test.txt", "text/plain", 4)
	if err == nil {
		t.Fatal("expected error when S3 not configured")
	}
}
