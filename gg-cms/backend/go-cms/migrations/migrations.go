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
// It enforces strict version prefix uniqueness, continuous numeric indexing (001..N),
// and records applied migrations in a schema_migrations tracking table.
func Run(db *gorm.DB) error {
	entries, err := fs.ReadDir(sqlFiles, "postgres")
	if err != nil {
		return fmt.Errorf("migrations: cannot read embedded directory: %w", err)
	}

	var names []string
	versionMap := make(map[int]string) // numeric index -> filename

	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			name := e.Name()
			parts := strings.SplitN(name, "_", 2)
			if len(parts) >= 1 && len(parts[0]) > 0 {
				var idx int
				if _, parseErr := fmt.Sscanf(parts[0], "%d", &idx); parseErr == nil {
					if existing, found := versionMap[idx]; found {
						return fmt.Errorf("migrations: FATAL collision detected for version index %03d: files %q and %q share the same index", idx, existing, name)
					}
					versionMap[idx] = name
				}
			}
			names = append(names, name)
		}
	}
	sort.Strings(names)

	// Validate sequential continuity from index 1 to len(names)
	for i := 1; i <= len(names); i++ {
		if _, found := versionMap[i]; !found {
			return fmt.Errorf("migrations: FATAL sequence gap detected: missing migration for version index %03d", i)
		}
	}

	// Ensure schema_migrations version tracking table exists
	if err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version VARCHAR(255) PRIMARY KEY,
		applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
	)`).Error; err != nil {
		return fmt.Errorf("migrations: failed to create schema_migrations table: %w", err)
	}

	for _, name := range names {
		var count int64
		db.Raw("SELECT COUNT(1) FROM schema_migrations WHERE version = ?", name).Scan(&count)
		if count > 0 {
			applogger.Info("migrations: skipping already applied file", zap.String("file", name))
			continue
		}

		content, err := fs.ReadFile(sqlFiles, "postgres/"+name)
		if err != nil {
			return fmt.Errorf("migrations: cannot read %q: %w", name, err)
		}
		applogger.Info("migrations: applying", zap.String("file", name))
		if err := db.Exec(string(content)).Error; err != nil {
			return fmt.Errorf("migrations: failed to apply %q: %w", name, err)
		}

		if err := db.Exec("INSERT INTO schema_migrations (version, applied_at) VALUES (?, NOW()) ON CONFLICT (version) DO NOTHING", name).Error; err != nil {
			return fmt.Errorf("migrations: failed to record %q in schema_migrations: %w", name, err)
		}
	}

	// Trigger DB self-healing taxonomy integrity auditor
	if err := db.Exec("SELECT fn_audit_taxonomy_integrity()").Error; err != nil {
		applogger.Warn("migrations: taxonomy integrity auditor returned notice", zap.Error(err))
	}

	applogger.Info("migrations: done", zap.Int("count", len(names)))
	return nil
}
