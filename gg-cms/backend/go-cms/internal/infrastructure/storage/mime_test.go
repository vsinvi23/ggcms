package storage_test

import (
	"os"
	"strings"
	"testing"

	"github.com/serenya/go-cms/internal/infrastructure/storage"
)

func TestExtensionForMIME(t *testing.T) {
	if storage.ExtensionForMIME("image/png") != ".png" {
		t.Fatal("png")
	}
	if storage.ExtensionForMIME("image/jpeg; charset=x") != ".jpg" {
		t.Fatal("jpeg with params")
	}
	if storage.ExtensionForMIME("text/html") != ".bin" {
		t.Fatal("unknown/dangerous types must map to .bin")
	}
}

func TestLocalProvider_IgnoresClientFilenameExtension(t *testing.T) {
	dir := t.TempDir()
	p := storage.NewLocalProvider(dir, "http://x/uploads")
	key, _, err := p.Save(strings.NewReader("data"), "evil.html", "image/png", 4)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(key, ".png") || strings.Contains(key, "html") {
		t.Fatalf("extension must derive from MIME, got %s", key)
	}
	_ = os.Remove(dir + "/" + key)
}

func TestValidateS3Endpoint(t *testing.T) {
	bad := []string{"http://s3.example.com", "https://127.0.0.1", "https://10.0.0.5", "https://169.254.169.254", "https://localhost", "ftp://x.com", "https://user:pw@s3.example.com"}
	for _, e := range bad {
		if storage.ValidateS3Endpoint(e) == nil {
			t.Errorf("%s should be rejected", e)
		}
	}
	for _, e := range []string{"", "https://s3.example.com", "https://abc.r2.cloudflarestorage.com"} {
		if err := storage.ValidateS3Endpoint(e); err != nil {
			t.Errorf("%s should be accepted: %v", e, err)
		}
	}
}
