package migrations

import (
	"strings"
	"testing"
)

func TestMigrationFileUniqueness(t *testing.T) {
	entries, err := sqlFiles.ReadDir("postgres")
	if err != nil {
		t.Fatalf("failed to read embedded postgres directory: %v", err)
	}

	versionMap := make(map[string]string)
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			name := e.Name()
			parts := strings.SplitN(name, "_", 2)
			if len(parts) >= 1 && len(parts[0]) > 0 {
				prefix := parts[0]
				if existing, found := versionMap[prefix]; found {
					t.Errorf("MIGRATION COLLISION DETECTED: index %q is used by both %q and %q", prefix, existing, name)
				}
				versionMap[prefix] = name
			}
		}
	}
}
