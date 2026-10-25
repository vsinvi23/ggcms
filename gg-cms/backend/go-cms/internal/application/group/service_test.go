package group_test

import (
	"context"
	"errors"
	"testing"

	groupsvc "github.com/serenya/go-cms/internal/application/group"
	"github.com/serenya/go-cms/internal/application/identity"
	"github.com/serenya/go-cms/internal/application/identity/identitytest"
	"github.com/serenya/go-cms/internal/domain/entity"
)

func TestRemoveMemberLastAdminGuard(t *testing.T) {
	cases := []struct {
		name    string
		setup   func(s *identitytest.GroupStore) (groupID, userID uint)
		wantErr error
	}{
		{"sole admin refused", func(s *identitytest.GroupStore) (uint, uint) {
			a := s.NewGroup("Admin")
			u := s.NewUser(entity.UserStatusActive, a)
			s.NewUser(entity.UserStatusActive, s.NewGroup("Editors"))
			return a.ID, u.ID
		}, identity.ErrLastAdmin},
		{"only other admin is deactivated", func(s *identitytest.GroupStore) (uint, uint) {
			a := s.NewGroup("Admin")
			s.NewUser(entity.UserStatusDeactivated, a)
			u := s.NewUser(entity.UserStatusActive, a)
			return a.ID, u.ID
		}, identity.ErrLastAdmin},
		{"another active admin exists", func(s *identitytest.GroupStore) (uint, uint) {
			a := s.NewGroup("Admin")
			s.NewUser(entity.UserStatusActive, a)
			u := s.NewUser(entity.UserStatusActive, a)
			return a.ID, u.ID
		}, nil},
		{"admin via second admin group", func(s *identitytest.GroupStore) (uint, uint) {
			a := s.NewGroup("Admin")
			b := s.NewGroup("SuperAdmin")
			u := s.NewUser(entity.UserStatusActive, a, b)
			s.NewUser(entity.UserStatusActive, a)
			return a.ID, u.ID
		}, nil},
		{"non-admin group unaffected", func(s *identitytest.GroupStore) (uint, uint) {
			s.NewUser(entity.UserStatusActive, s.NewGroup("Admin"))
			e := s.NewGroup("Editors")
			s.NewUser(entity.UserStatusActive, e)
			u := s.NewUser(entity.UserStatusActive, e)
			return e.ID, u.ID
		}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := identitytest.NewGroupStore()
			gid, uid := tc.setup(s)
			err := groupsvc.NewService(s, nil).RemoveMember(context.Background(), gid, uid)
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			_, still := s.Members[gid][uid]
			if tc.wantErr != nil && !still {
				t.Fatal("member was removed despite refusal")
			}
		})
	}
}
