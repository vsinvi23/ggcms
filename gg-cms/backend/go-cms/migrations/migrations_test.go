package migrations

import (
	"fmt"
	"strings"
	"testing"
)

func TestMigrationFileUniqueness(t *testing.T) {
	entries, err := sqlFiles.ReadDir("postgres")
	if err != nil {
		t.Fatalf("failed to read embedded postgres directory: %v", err)
	}

	versionMap := make(map[int]string)
	var count int
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			count++
			name := e.Name()
			parts := strings.SplitN(name, "_", 2)
			if len(parts) >= 1 && len(parts[0]) > 0 {
				var idx int
				if _, parseErr := fmt.Sscanf(parts[0], "%d", &idx); parseErr == nil {
					if existing, found := versionMap[idx]; found {
						t.Errorf("MIGRATION COLLISION DETECTED: index %03d is used by both %q and %q", idx, existing, name)
					}
					versionMap[idx] = name
				}
			}
		}
	}

	for i := 1; i <= count; i++ {
		if _, found := versionMap[i]; !found {
			t.Errorf("MIGRATION SEQUENCE GAP DETECTED: missing migration index %03d in postgres/ directory", i)
		}
	}
}
