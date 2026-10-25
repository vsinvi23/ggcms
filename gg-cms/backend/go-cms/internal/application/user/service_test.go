package user_test

import (
	"context"
	"errors"
	"testing"

	"github.com/serenya/go-cms/internal/application/identity/identitytest"
	usersvc "github.com/serenya/go-cms/internal/application/user"
)

func TestUserLastAdminGuard(t *testing.T) {
	status := func(s string) *string { return &s }
	type fixture struct {
		svc     usersvc.Service
		groups  *identitytest.GroupStore
		adminID uint
		editor  uint
	}
	build := func(otherAdmin bool) fixture {
		users := identitytest.NewStore()
		groups := identitytest.NewGroupStore()
		admin := groups.NewGroup("Admin")
		editors := groups.NewGroup("Editors")
		u := users.AddUser("a@x.io", true)
		groups.Users[u.ID] = u
		groups.Members[admin.ID][u.ID] = struct{}{}
		if otherAdmin {
			o := users.AddUser("b@x.io", true)
			groups.Users[o.ID] = o
			groups.Members[admin.ID][o.ID] = struct{}{}
		}
		e := users.AddUser("e@x.io", true)
		groups.Users[e.ID] = e
		groups.Members[editors.ID][e.ID] = struct{}{}
		return fixture{usersvc.NewService(users, groups), groups, u.ID, editors.ID}
	}
	ctx := context.Background()

	cases := []struct {
		name       string
		otherAdmin bool
		act        func(f fixture) error
		wantErr    error
	}{
		{"delete sole admin", false, func(f fixture) error { return f.svc.Delete(ctx, f.adminID) }, usersvc.ErrLastAdmin},
		{"deactivate sole admin", false, func(f fixture) error { return f.svc.Deactivate(ctx, f.adminID) }, usersvc.ErrLastAdmin},
		{"update status sole admin", false, func(f fixture) error {
			_, err := f.svc.Update(ctx, f.adminID, "", nil, status("DEACTIVATED"), nil)
			return err
		}, usersvc.ErrLastAdmin},
		{"update group replace sole admin", false, func(f fixture) error {
			_, err := f.svc.Update(ctx, f.adminID, "", nil, nil, &f.editor)
			return err
		}, usersvc.ErrLastAdmin},
		{"update group replace with other admin present", true, func(f fixture) error {
			_, err := f.svc.Update(ctx, f.adminID, "", nil, nil, &f.editor)
			return err
		}, nil},
		{"delete admin with other admin present", true, func(f fixture) error { return f.svc.Delete(ctx, f.adminID) }, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := build(tc.otherAdmin)
			if err := tc.act(f); !errors.Is(err, tc.wantErr) {
				t.Fatalf("err = %v, want %v", err, tc.wantErr)
			}
			if tc.wantErr != nil {
				gs, _ := f.groups.FindByUserID(ctx, f.adminID)
				if len(gs) != 1 || gs[0].Name != "Admin" {
					t.Fatalf("admin membership changed: %+v", gs)
				}
			}
		})
	}
}
