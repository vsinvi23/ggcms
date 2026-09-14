// Package migrations embeds all SQL migration files and provides a Run
// function to apply them in order. Files use IF NOT EXISTS / ON CONFLICT DO
// NOTHING so they are safe to re-apply on every server start.
package migrations

import (
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"

	applogger "github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

//go:embed postgres/*.sql
var sqlFiles embed.FS

// Run applies every *.sql file from the embedded postgres/ directory in
// sorted (lexicographic) order using the supplied GORM write connection.
// It enforces strict version prefix unique constraint to prevent migration collisions.
func Run(db *gorm.DB) error {
	entries, err := fs.ReadDir(sqlFiles, "postgres")
	if err != nil {
		return fmt.Errorf("migrations: cannot read embedded directory: %w", err)
	}

	var names []string
	versionMap := make(map[string]string) // prefix -> filename

	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			name := e.Name()
			parts := strings.SplitN(name, "_", 2)
			if len(parts) >= 1 && len(parts[0]) > 0 {
				prefix := parts[0]
				if existing, found := versionMap[prefix]; found {
					return fmt.Errorf("migrations: FATAL collision detected for version index %q: files %q and %q share the same index", prefix, existing, name)
				}
				versionMap[prefix] = name
			}
			names = append(names, name)
		}
	}
	sort.Strings(names)

	for _, name := range names {
		content, err := fs.ReadFile(sqlFiles, "postgres/"+name)
		if err != nil {
			return fmt.Errorf("migrations: cannot read %q: %w", name, err)
		}
		applogger.Info("migrations: applying", zap.String("file", name))
		if err := db.Exec(string(content)).Error; err != nil {
			return fmt.Errorf("migrations: failed to apply %q: %w", name, err)
		}
	}

	applogger.Info("migrations: done", zap.Int("count", len(names)))
	return nil
}
