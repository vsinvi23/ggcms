package identity

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

const (
	RoleAdmin = "admin"
	RoleUser  = "user"

	LearnerGroup = "Learner"
)

var adminGroupNames = map[string]struct{}{
	"admin": {}, "superadmin": {}, "super_admin": {}, "super-admin": {}, "masteradmin": {}, "master_admin": {},
}

var ErrLastAdmin = errors.New("cannot remove or deactivate the last active administrator")

var superAdminGroupNames = map[string]struct{}{
	"superadmin": {}, "super_admin": {}, "super-admin": {}, "masteradmin": {}, "master_admin": {},
}

func IsAdminGroup(g entity.Group) bool {
	_, ok := adminGroupNames[strings.ToLower(strings.TrimSpace(g.Name))]
	return ok
}

// IsSuperAdmin reports whether any group is a super-admin group; plain "Admin" is not.
func IsSuperAdmin(groups []entity.Group) bool {
	for _, g := range groups {
		if _, ok := superAdminGroupNames[strings.ToLower(strings.TrimSpace(g.Name))]; ok {
			return true
		}
	}
	return false
}

// EnsureAdminRemains returns ErrLastAdmin when taking userID out of fromGroupID
// (0 = all groups) would leave no other active administrator.
func EnsureAdminRemains(ctx context.Context, repo repository.GroupRepository, userID, fromGroupID uint) error {
	userGroups, err := repo.FindByUserID(ctx, userID)
	if err != nil {
		return err
	}
	losesAdmin := false
	for _, g := range userGroups {
		if !IsAdminGroup(g) {
			continue
		}
		if fromGroupID == 0 || g.ID == fromGroupID {
			losesAdmin = true
		}
	}
	if !losesAdmin {
		return nil
	}
	if fromGroupID != 0 {
		for _, g := range userGroups {
			if IsAdminGroup(g) && g.ID != fromGroupID {
				return nil
			}
		}
	}
	all, _, err := repo.FindAll(ctx, 0, 1000)
	if err != nil {
		return err
	}
	for _, g := range all {
		if !IsAdminGroup(*g) {
			continue
		}
		members, err := repo.FindMembers(ctx, g.ID)
		if err != nil {
			return err
		}
		for _, m := range members {
			if m.ID != userID && m.Status == entity.UserStatusActive {
				return nil
			}
		}
	}
	return ErrLastAdmin
}

// RoleFromGroups is the single place that maps group membership to a role.
func RoleFromGroups(groups []entity.Group) string {
	for _, g := range groups {
		if IsAdminGroup(g) {
			return RoleAdmin
		}
	}
	return RoleUser
}

// IsPrivileged reports whether the groups grant anything beyond the default Learner group.
func IsPrivileged(groups []entity.Group) bool {
	for _, g := range groups {
		if !strings.EqualFold(g.Name, LearnerGroup) {
			return true
		}
	}
	return false
}

type RoleResolver struct {
	groups repository.GroupRepository
}

func NewRoleResolver(groups repository.GroupRepository) *RoleResolver {
	return &RoleResolver{groups: groups}
}

// ForUser fails closed: on any lookup error the caller gets the least-privileged
// role together with the error.
func (r *RoleResolver) ForUser(ctx context.Context, userID uint) (string, []entity.Group, error) {
	groups, err := r.groups.FindByUserID(ctx, userID)
	if err != nil {
		return RoleUser, nil, fmt.Errorf("resolve role: %w", err)
	}
	return RoleFromGroups(groups), groups, nil
}
