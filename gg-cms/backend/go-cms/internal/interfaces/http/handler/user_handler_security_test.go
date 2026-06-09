package handler_test

// user_handler_security_test.go — unit tests for ownership and field-level access
// controls in UserHandler.Update.
//
// All tests run entirely in-process using Gin test mode + httptest.
// No server or database required.

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	usersvc "github.com/serenya/go-cms/internal/application/user"
	"github.com/serenya/go-cms/internal/domain/entity"
	"github.com/serenya/go-cms/internal/interfaces/http/handler"
)

func init() { gin.SetMode(gin.TestMode) }

// ─── stub user service ────────────────────────────────────────────────────────

type stubUserService struct {
	user      *entity.User
	updateErr error
}

func (s *stubUserService) GetAll(_ context.Context, _, _ int) ([]*entity.User, int64, error) {
	return nil, 0, nil
}
func (s *stubUserService) GetByID(_ context.Context, id uint) (*entity.User, error) {
	if s.user != nil {
		return s.user, nil
	}
	return &entity.User{ID: id}, nil
}
func (s *stubUserService) CreateUser(_ context.Context, _, _, _ string, _ *uint) (*entity.User, error) {
	return &entity.User{}, nil
}
func (s *stubUserService) Update(_ context.Context, id uint, _ string, _ *string, _ *string, _ *uint) (*entity.User, error) {
	if s.updateErr != nil {
		return nil, s.updateErr
	}
	return &entity.User{ID: id, Groups: []entity.Group{}}, nil
}
func (s *stubUserService) Delete(_ context.Context, _ uint) error   { return nil }
func (s *stubUserService) Activate(_ context.Context, _ uint) error { return nil }
func (s *stubUserService) Deactivate(_ context.Context, _ uint) error { return nil }
func (s *stubUserService) GetGroups(_ context.Context, _ uint) ([]entity.Group, error) {
	return nil, nil
}

// Verify the stub satisfies the interface at compile time.
var _ usersvc.Service = (*stubUserService)(nil)

// ─── test router helper ───────────────────────────────────────────────────────

// authMiddleware injects fake user credentials into the Gin context.
// This sets the same keys that middleware.Auth() sets so that
// middleware.GetUserID() and middleware.IsAdmin() work correctly in handlers.
func authMiddleware(userID uint, role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("userID", userID)
		c.Set("role", role)
		c.Set("email", "test@example.com")
		c.Next()
	}
}

func newUserRouter(svc usersvc.Service, authUserID uint, role string) *gin.Engine {
	r := gin.New()
	h := handler.NewUserHandler(svc)
	r.PUT("/api/users/:id", authMiddleware(authUserID, role), h.Update)
	return r
}

func putJSON(r *gin.Engine, path string, body interface{}) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPut, path, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// ─── tests ────────────────────────────────────────────────────────────────────

// TestUserUpdate_OwnProfile_Allowed verifies that a user can update their own
// profile (name, mobileNo) without hitting any restriction.
func TestUserUpdate_OwnProfile_Allowed(t *testing.T) {
	const ownerID = uint(42)
	r := newUserRouter(&stubUserService{}, ownerID, "user")

	w := putJSON(r, "/api/users/42", map[string]interface{}{
		"name":     "Updated Name",
		"mobileNo": "9876543210",
	})
	if w.Code != http.StatusOK {
		t.Errorf("owner updating own profile: expected 200, got %d — body: %s", w.Code, w.Body)
	}
}

// TestUserUpdate_AnotherUser_Forbidden verifies that user 42 cannot update
// user 99's profile.
func TestUserUpdate_AnotherUser_Forbidden(t *testing.T) {
	const authUserID = uint(42)
	r := newUserRouter(&stubUserService{}, authUserID, "user")

	w := putJSON(r, "/api/users/99", map[string]interface{}{
		"name": "Hacked Name",
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("non-owner updating other user: expected 403, got %d — body: %s", w.Code, w.Body)
	}
}

// TestUserUpdate_OwnStatus_Forbidden verifies that a non-admin cannot change their
// own status field (e.g. to reactivate a deactivated account).
func TestUserUpdate_OwnStatus_Forbidden(t *testing.T) {
	const ownerID = uint(42)
	r := newUserRouter(&stubUserService{}, ownerID, "user")

	w := putJSON(r, "/api/users/42", map[string]interface{}{
		"status": "active",
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("non-admin setting status: expected 403, got %d — body: %s", w.Code, w.Body)
	}
}

// TestUserUpdate_OwnGroupID_Forbidden verifies that a non-admin cannot assign
// themselves to an admin group by sending groupId.
func TestUserUpdate_OwnGroupID_Forbidden(t *testing.T) {
	const ownerID = uint(42)
	r := newUserRouter(&stubUserService{}, ownerID, "user")

	w := putJSON(r, "/api/users/42", map[string]interface{}{
		"groupId": 1, // admin group
	})
	if w.Code != http.StatusForbidden {
		t.Errorf("non-admin setting groupId: expected 403, got %d — body: %s", w.Code, w.Body)
	}
}

// TestUserUpdate_Admin_AnyUser_Allowed verifies that an admin can update any
// user's profile, status, and groupId.
func TestUserUpdate_Admin_AnyUser_Allowed(t *testing.T) {
	const adminID = uint(1)
	r := newUserRouter(&stubUserService{}, adminID, "admin")

	w := putJSON(r, "/api/users/99", map[string]interface{}{
		"name":     "Admin Updated",
		"status":   "active",
		"groupId":  2,
	})
	if w.Code != http.StatusOK {
		t.Errorf("admin updating any user: expected 200, got %d — body: %s", w.Code, w.Body)
	}
}
