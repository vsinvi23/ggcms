package identitytest

import (
	"context"
	"errors"
	"sort"

	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/domain/repository"
)

type GroupStore struct {
	Groups  map[uint]*entity.Group
	Users   map[uint]*entity.User
	Members map[uint]map[uint]struct{}
	nextID  uint
}

var _ repository.GroupRepository = (*GroupStore)(nil)

func NewGroupStore() *GroupStore {
	return &GroupStore{Groups: map[uint]*entity.Group{}, Users: map[uint]*entity.User{}, Members: map[uint]map[uint]struct{}{}}
}

func (s *GroupStore) NewGroup(name string) *entity.Group {
	s.nextID++
	g := &entity.Group{Name: name}
	g.ID = s.nextID
	s.Groups[g.ID] = g
	s.Members[g.ID] = map[uint]struct{}{}
	return g
}

func (s *GroupStore) NewUser(status entity.UserStatus, groups ...*entity.Group) *entity.User {
	s.nextID++
	u := &entity.User{Status: status}
	u.ID = s.nextID
	s.Users[u.ID] = u
	for _, g := range groups {
		s.Members[g.ID][u.ID] = struct{}{}
	}
	return u
}

func (s *GroupStore) Create(_ context.Context, g *entity.Group) error { s.Groups[g.ID] = g; return nil }
func (s *GroupStore) Update(_ context.Context, g *entity.Group) error { s.Groups[g.ID] = g; return nil }
func (s *GroupStore) Delete(_ context.Context, id uint) error         { delete(s.Groups, id); return nil }
func (s *GroupStore) AddMember(_ context.Context, groupID, userID uint) error {
	if s.Members[groupID] == nil {
		s.Members[groupID] = map[uint]struct{}{}
	}
	s.Members[groupID][userID] = struct{}{}
	return nil
}
func (s *GroupStore) RemoveMember(_ context.Context, groupID, userID uint) error {
	delete(s.Members[groupID], userID)
	return nil
}
func (s *GroupStore) FindByID(_ context.Context, id uint) (*entity.Group, error) {
	if g, ok := s.Groups[id]; ok {
		return g, nil
	}
	return nil, errors.New("group not found")
}
func (s *GroupStore) FindByName(_ context.Context, name string) (*entity.Group, error) {
	for _, g := range s.Groups {
		if g.Name == name {
			return g, nil
		}
	}
	return nil, errors.New("group not found")
}
func (s *GroupStore) FindAll(_ context.Context, _, _ int) ([]*entity.Group, int64, error) {
	out := make([]*entity.Group, 0, len(s.Groups))
	for _, g := range s.Groups {
		out = append(out, g)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out, int64(len(out)), nil
}
func (s *GroupStore) FindMembers(_ context.Context, groupID uint) ([]*entity.User, error) {
	var out []*entity.User
	for uid := range s.Members[groupID] {
		out = append(out, s.Users[uid])
	}
	return out, nil
}
func (s *GroupStore) FindByUserID(_ context.Context, userID uint) ([]entity.Group, error) {
	var out []entity.Group
	for gid, m := range s.Members {
		if _, ok := m[userID]; ok {
			out = append(out, *s.Groups[gid])
		}
	}
	return out, nil
}
