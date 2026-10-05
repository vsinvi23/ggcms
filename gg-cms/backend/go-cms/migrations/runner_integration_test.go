// Integration test: applies the embedded migrations twice (second run must be a no-op).
// Skipped unless SCRATCH_DSN points at a throwaway database. Set SEED_SAMPLE_CONTENT=false
// to exercise the no-sample-content path.
package migrations

import (
	"os"
	"testing"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestRunnerIntegration(t *testing.T) {
	dsn := os.Getenv("SCRATCH_DSN")
	if dsn == "" {
		t.Skip("set SCRATCH_DSN to a throwaway Postgres to run")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	for i := 1; i <= 2; i++ { // second Run must be a no-op
		if err := Run(db); err != nil {
			t.Fatalf("Run #%d: %v", i, err)
		}
	}
}
