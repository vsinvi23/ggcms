// Package bootstrap handles one-time startup tasks such as seeding the master
// admin user from environment configuration.
package bootstrap

import (
	"context"
	"errors"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/pkg/config"
	"github.com/serenya/go-cms/pkg/logger"
	"github.com/serenya/go-cms/pkg/password"
	"go.uber.org/zap"
	"gorm.io/gorm"
)

const adminGroupName = "Admin"

// SeedAdmin ensures the master admin user exists and belongs to the Admin group.
//
// It is safe to call on every startup — all operations are idempotent:
//   - Creates the Admin group if missing.
//   - Creates the admin user if the configured email is not yet registered.
//   - Adds the user to the Admin group if not already a member.
//
// If ADMIN_PASSWORD is empty the seed step is skipped and a warning is logged.
func SeedAdmin(db *gorm.DB, cfg *config.AdminConfig) {
	if cfg.Password == "" {
		logger.Warn("bootstrap: ADMIN_PASSWORD not set — skipping master admin seed")
		return
	}

	ctx := context.Background()

	// ── Ensure Admin group exists ───────────────────────────────────────────
	group := &entity.Group{}
	err := db.WithContext(ctx).Where("name = ?", adminGroupName).First(group).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		group.Name = adminGroupName
		if err = db.WithContext(ctx).Create(group).Error; err != nil {
			logger.Error("bootstrap: failed to create Admin group", zap.Error(err))
			return
		}
		logger.Info("bootstrap: Admin group created")
	} else if err != nil {
		logger.Error("bootstrap: failed to query Admin group", zap.Error(err))
		return
	}

	// ── Ensure admin user exists ────────────────────────────────────────────
	user := &entity.User{}
	err = db.WithContext(ctx).Where("email = ?", cfg.Email).First(user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		hash, hashErr := password.Hash(cfg.Password)
		if hashErr != nil {
			logger.Error("bootstrap: failed to hash admin password", zap.Error(hashErr))
			return
		}
		user = &entity.User{
			Email:        cfg.Email,
			PasswordHash: hash,
			Name:         cfg.Name,
			Status:       entity.UserStatusActive,
		}
		if err = db.WithContext(ctx).Create(user).Error; err != nil {
			logger.Error("bootstrap: failed to create admin user", zap.Error(err))
			return
		}
		logger.Info("bootstrap: master admin user created",
			zap.String("email", cfg.Email),
			zap.String("name", cfg.Name),
		)
	} else if err != nil {
		logger.Error("bootstrap: failed to query admin user", zap.Error(err))
		return
	} else {
		logger.Info("bootstrap: master admin user already exists",
			zap.String("email", cfg.Email),
		)
	}

	// ── Ensure admin user is in Admin group ─────────────────────────────────
	var count int64
	db.WithContext(ctx).Table("user_groups").
		Where("user_id = ? AND group_id = ?", user.ID, group.ID).
		Count(&count)

	if count == 0 {
		if err = db.WithContext(ctx).Exec(
			"INSERT INTO user_groups (user_id, group_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
			user.ID, group.ID,
		).Error; err != nil {
			logger.Error("bootstrap: failed to assign admin to Admin group", zap.Error(err))
			return
		}
		logger.Info("bootstrap: admin user assigned to Admin group")
	}

	// Ensure no group is left without at least one member — add admin to any empty group
	var emptyGroupIDs []uint
	db.WithContext(ctx).Raw(`
		SELECT g.id FROM groups g
		LEFT JOIN user_groups ug ON ug.group_id = g.id
		WHERE g.deleted_at IS NULL
		GROUP BY g.id HAVING COUNT(ug.user_id) = 0
	`).Pluck("id", &emptyGroupIDs)

	for _, gid := range emptyGroupIDs {
		db.WithContext(ctx).Exec(
			"INSERT INTO user_groups (user_id, group_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
			user.ID, gid,
		)
		logger.Info("bootstrap: added admin to empty group", zap.Uint("groupID", gid))
	}

	// ── Seed "geek" virtual root category + link Admin group ───────────────
	seedGeekCategory(ctx, db, group)

	// ── Seed secondary admin (geekadmin@geekgully.com) ──────────────────────
	seedSecondaryAdmin(ctx, db, cfg, group)
}

// seedGeekCategory ensures the "geek" virtual root category exists and that the
// Admin group is linked to it as a reviewer group.
// Being assigned to "geek" transitively covers every category in the tree, giving
// the master admin effective reviewer access over all content.
func seedGeekCategory(ctx context.Context, db *gorm.DB, adminGroup *entity.Group) {
	const geekSlug = "geek"

	// Ensure the category row exists (migration 020 also creates it, but this
	// guard handles test environments where migrations may run in a different order).
	if err := db.WithContext(ctx).Exec(`
		INSERT INTO categories (name, slug, parent_id, is_virtual, created_at, updated_at)
		VALUES ('geek', ?, NULL, TRUE, NOW(), NOW())
		ON CONFLICT (slug) DO NOTHING`, geekSlug,
	).Error; err != nil {
		logger.Error("bootstrap: failed to seed geek category", zap.Error(err))
		return
	}

	var geekID uint
	if err := db.WithContext(ctx).Raw(
		"SELECT id FROM categories WHERE slug = ? AND is_virtual = TRUE", geekSlug,
	).Scan(&geekID).Error; err != nil || geekID == 0 {
		logger.Error("bootstrap: could not resolve geek category ID")
		return
	}

	// Reparent any still-null top-level (non-virtual) categories.
	db.WithContext(ctx).Exec(`
		UPDATE categories SET parent_id = ?, updated_at = NOW()
		WHERE parent_id IS NULL AND id != ? AND is_virtual = FALSE`, geekID, geekID)

	// Link Admin group to geek as a reviewer group.
	if err := db.WithContext(ctx).Exec(`
		INSERT INTO category_reviewer_groups (category_id, group_id)
		VALUES (?, ?) ON CONFLICT DO NOTHING`, geekID, adminGroup.ID,
	).Error; err != nil {
		logger.Error("bootstrap: failed to link Admin group to geek category", zap.Error(err))
		return
	}
	logger.Info("bootstrap: geek virtual root category seeded and Admin group linked")
}

// seedSecondaryAdmin seeds an additional admin user from GEEK_ADMIN_* env vars.
// It is idempotent and skipped when GEEK_ADMIN_PASSWORD is empty.
func seedSecondaryAdmin(ctx context.Context, db *gorm.DB, cfg *config.AdminConfig, adminGroup *entity.Group) {
	if cfg.GeekAdminPassword == "" || cfg.GeekAdminEmail == "" {
		return
	}

	user := &entity.User{}
	err := db.WithContext(ctx).Where("email = ?", cfg.GeekAdminEmail).First(user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		hash, hashErr := password.Hash(cfg.GeekAdminPassword)
		if hashErr != nil {
			logger.Error("bootstrap: failed to hash geek admin password", zap.Error(hashErr))
			return
		}
		user = &entity.User{
			Email:        cfg.GeekAdminEmail,
			PasswordHash: hash,
			Name:         cfg.GeekAdminName,
			Status:       entity.UserStatusActive,
		}
		if err = db.WithContext(ctx).Create(user).Error; err != nil {
			logger.Error("bootstrap: failed to create geek admin user", zap.Error(err))
			return
		}
		logger.Info("bootstrap: geek admin user created", zap.String("email", cfg.GeekAdminEmail))
	} else if err != nil {
		logger.Error("bootstrap: failed to query geek admin user", zap.Error(err))
		return
	}

	// Ensure membership in Admin group
	var count int64
	db.WithContext(ctx).Table("user_groups").
		Where("user_id = ? AND group_id = ?", user.ID, adminGroup.ID).
		Count(&count)
	if count == 0 {
		if err = db.WithContext(ctx).Exec(
			"INSERT INTO user_groups (user_id, group_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
			user.ID, adminGroup.ID,
		).Error; err != nil {
			logger.Error("bootstrap: failed to assign geek admin to Admin group", zap.Error(err))
			return
		}
		logger.Info("bootstrap: geek admin assigned to Admin group", zap.String("email", cfg.GeekAdminEmail))
	}
}
