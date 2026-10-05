// Package migrations embeds all SQL migration files and provides a Run
// function to apply them in order. Each file is applied once (tracked in
// schema_migrations) inside a transaction, under a Postgres advisory lock.
// Files must never drop or reset the schema.
package migrations

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"sort"
	"strings"

	applogger "github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

//go:embed postgres/*.sql
var sqlFiles embed.FS

// migrationLockKey is the app-wide Postgres advisory lock id for Run.
const migrationLockKey int64 = 7424817301

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

	// Serialise concurrent instances (e.g. Cloud Run cold starts): the advisory
	// lock is session-scoped, so hold it on one dedicated connection.
	sqlDB, err := db.DB()
	if err != nil {
		return fmt.Errorf("migrations: cannot get sql.DB: %w", err)
	}
	lockConn, err := sqlDB.Conn(context.Background())
	if err != nil {
		return fmt.Errorf("migrations: cannot get lock connection: %w", err)
	}
	defer lockConn.Close()
	if _, err := lockConn.ExecContext(context.Background(), "SELECT pg_advisory_lock($1)", migrationLockKey); err != nil {
		return fmt.Errorf("migrations: cannot acquire advisory lock: %w", err)
	}
	defer lockConn.ExecContext(context.Background(), "SELECT pg_advisory_unlock($1)", migrationLockKey) //nolint:errcheck

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
		// The file and its tracking row commit together, so a failure midway
		// leaves nothing half-applied and the file is retried on next start.
		if err := db.Transaction(func(tx *gorm.DB) error {
			// Expose SEED_SAMPLE_CONTENT to the SQL (transaction-local) so sample content can be skipped.
			if v := os.Getenv("SEED_SAMPLE_CONTENT"); v != "" {
				if err := tx.Exec("SELECT set_config('gg.seed_sample_content', ?, true)", strings.ToLower(v)).Error; err != nil {
					return fmt.Errorf("failed to set gg.seed_sample_content: %w", err)
				}
			}
			if err := tx.Exec(string(content)).Error; err != nil {
				return fmt.Errorf("failed to apply %q: %w", name, err)
			}
			if err := tx.Exec("INSERT INTO schema_migrations (version, applied_at) VALUES (?, NOW()) ON CONFLICT (version) DO NOTHING", name).Error; err != nil {
				return fmt.Errorf("failed to record %q in schema_migrations: %w", name, err)
			}
			return nil
		}); err != nil {
			return fmt.Errorf("migrations: %w", err)
		}
	}

	// Trigger DB self-healing taxonomy integrity auditor
	if err := db.Exec("SELECT fn_audit_taxonomy_integrity()").Error; err != nil {
		applogger.Warn("migrations: taxonomy integrity auditor returned notice", zap.Error(err))
	}

	applogger.Info("migrations: done", zap.Int("count", len(names)))
	return nil
}
