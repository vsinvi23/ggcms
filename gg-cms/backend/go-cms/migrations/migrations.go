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
func Run(db *gorm.DB) error {
	entries, err := fs.ReadDir(sqlFiles, "postgres")
	if err != nil {
		return fmt.Errorf("migrations: cannot read embedded directory: %w", err)
	}

	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
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
