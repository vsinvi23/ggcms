package database

import (
	"fmt"

	"github.com/serenya/go-cms/pkg/config"
	applogger "github.com/serenya/go-cms/pkg/logger"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// PostgresDB holds separate connections for write (primary) and read (replica) operations.
// All write operations (INSERT, UPDATE, DELETE) must use Write.
// All read operations (SELECT) should use Read for scalability.
type PostgresDB struct {
	Write *gorm.DB
	Read  *gorm.DB
}

func NewPostgresDB(cfg *config.DatabaseConfig) (*PostgresDB, error) {
	debug := applogger.IsDebug()
	gormCfg := &gorm.Config{
		Logger: newGormLogger(debug),
	}

	applogger.Info("postgres: connecting to write DB",
		zap.String("url", maskURL(cfg.WriteURL)),
		zap.Bool("sql_logging", debug),
	)
	writeDB, err := gorm.Open(postgres.Open(cfg.WriteURL), gormCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to write DB: %w", err)
	}
	applogger.Info("postgres: write DB connected")

	applogger.Info("postgres: connecting to read DB",
		zap.String("url", maskURL(cfg.ReadURL)),
	)
	readDB, err := gorm.Open(postgres.Open(cfg.ReadURL), gormCfg)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to read DB: %w", err)
	}
	applogger.Info("postgres: read DB connected")

	return &PostgresDB{Write: writeDB, Read: readDB}, nil
}

// maskURL redacts the password portion of a postgres connection URL for safe logging.
func maskURL(url string) string {
	// postgres://user:password@host/db  →  postgres://user:***@host/db
	for i := 0; i < len(url); i++ {
		if url[i] == ':' && i+3 < len(url) && url[i+1] != '/' {
			// found user:password boundary — find the '@'
			for j := i + 1; j < len(url); j++ {
				if url[j] == '@' {
					return url[:i+1] + "***" + url[j:]
				}
			}
		}
	}
	return url
}
