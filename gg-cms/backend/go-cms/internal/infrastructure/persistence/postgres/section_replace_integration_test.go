package postgres

// Integration test for ReplaceCourseStructure. Skipped unless SCRATCH_DSN points at a throwaway
// database that already has the schema applied (run migrations.Run against it first).

import (
	"context"
	"os"
	"testing"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/migrations"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestReplaceCourseStructure_RealPostgres(t *testing.T) {
	dsn := os.Getenv("SCRATCH_DSN")
	if dsn == "" {
		t.Skip("set SCRATCH_DSN to a throwaway Postgres to run")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := migrations.Run(db); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	repo := NewSectionRepository(db, db)

	var uid uint
	db.Raw("INSERT INTO users (email,password_hash,name,status) VALUES ('t@t','x','T','ACTIVE') ON CONFLICT (email) DO UPDATE SET name='T' RETURNING id").Scan(&uid)
	course := &entity.Course{Title: "Replace Test", PublicID: "pub-replace", Slug: "replace-test", CreatedByID: uid, Status: entity.CMSStatusDraft, Version: 1}
	if err := db.Create(course).Error; err != nil {
		t.Fatal(err)
	}
	// An unrelated course whose structure must never be touched.
	other := &entity.Course{Title: "Other", PublicID: "pub-other", Slug: "other", CreatedByID: uid, Status: entity.CMSStatusDraft, Version: 1}
	db.Create(other)
	otherSec := &entity.Section{Title: "Keep me", CourseID: &other.ID, Lessons: []entity.Lesson{{Title: "k"}}}
	db.Create(otherSec)

	mk := func(titles ...string) []*entity.Section {
		var out []*entity.Section
		for i, tt := range titles {
			out = append(out, &entity.Section{Title: tt, Order: i, Lessons: []entity.Lesson{{Title: tt + "-L1", Order: 0}, {Title: tt + "-L2", Order: 1}}})
		}
		return out
	}
	count := func(model any, where string, args ...any) int64 {
		var n int64
		db.Model(model).Where(where, args...).Count(&n)
		return n
	}

	if err := repo.ReplaceCourseStructure(ctx, course.ID, mk("A", "B")); err != nil {
		t.Fatal(err)
	}
	if n := count(&entity.Section{}, "course_id = ?", course.ID); n != 2 {
		t.Fatalf("expected 2 sections after first import, got %d", n)
	}
	// Re-import (overwrite): must REPLACE, not append.
	if err := repo.ReplaceCourseStructure(ctx, course.ID, mk("C")); err != nil {
		t.Fatal(err)
	}
	if n := count(&entity.Section{}, "course_id = ?", course.ID); n != 1 {
		t.Fatalf("overwrite must replace sections, got %d live sections", n)
	}
	var secIDs []uint
	db.Model(&entity.Section{}).Where("course_id = ?", course.ID).Pluck("id", &secIDs)
	if n := count(&entity.Lesson{}, "section_id IN ?", secIDs); n != 2 {
		t.Fatalf("expected 2 lessons under the new section, got %d", n)
	}
	// Old lessons are gone too (soft-deleted), not orphaned and still live.
	if n := count(&entity.Lesson{}, "title LIKE ?", "A-%"); n != 0 {
		t.Fatalf("old lessons must not remain live, got %d", n)
	}
	// Other course untouched.
	if n := count(&entity.Section{}, "course_id = ?", other.ID); n != 1 {
		t.Fatalf("another course's sections must be untouched, got %d", n)
	}

	// Failure midway rolls everything back: force an error on the 2nd section (title too long).
	bad := mk("OK")
	bad = append(bad, &entity.Section{Title: "placeholder"})
	long := make([]byte, 600)
	for i := range long {
		long[i] = 'z'
	}
	bad[1].Title = string(long)
	if err := repo.ReplaceCourseStructure(ctx, course.ID, bad); err == nil {
		t.Fatal("expected an error for an over-long title")
	}
	var after []string
	db.Model(&entity.Section{}).Where("course_id = ?", course.ID).Pluck("title", &after)
	if len(after) != 1 || after[0] != "C" {
		t.Fatalf("a failed replace must leave the previous structure intact, got %v", after)
	}
}
