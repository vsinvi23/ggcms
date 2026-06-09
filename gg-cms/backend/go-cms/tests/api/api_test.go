// Package api contains integration tests for the go-cms HTTP API.
//
// Tests run against a live server on SERVER_URL (default http://localhost:1337).
// Start the stack first:
//
//	bash scripts/dev.sh
//
// Then run:
//
//	go test ./tests/api/... -v
//	go test ./tests/api/... -v -run TestAuth
package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"testing"
	"time"
)

// ── Config ───────────────────────────────────────────────────────────────────

var baseURL = func() string {
	if u := os.Getenv("SERVER_URL"); u != "" {
		return u
	}
	return "http://localhost:1337"
}()

// unique suffix so repeated runs don't collide on email uniqueness
var testSuffix = fmt.Sprintf("%d", time.Now().UnixMilli())

// ── HTTP helpers ──────────────────────────────────────────────────────────────

type apiClient struct {
	token string
	http  *http.Client
}

func newClient() *apiClient {
	return &apiClient{http: &http.Client{Timeout: 10 * time.Second}}
}

func (c *apiClient) do(method, path string, body interface{}) (*http.Response, map[string]interface{}) {
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, baseURL+path, r)
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, nil
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var m map[string]interface{}
	_ = json.Unmarshal(raw, &m)
	return resp, m
}

func (c *apiClient) get(path string) (*http.Response, map[string]interface{}) {
	return c.do(http.MethodGet, path, nil)
}

func (c *apiClient) post(path string, body interface{}) (*http.Response, map[string]interface{}) {
	return c.do(http.MethodPost, path, body)
}

func (c *apiClient) put(path string, body interface{}) (*http.Response, map[string]interface{}) {
	return c.do(http.MethodPut, path, body)
}

func (c *apiClient) delete(path string) (*http.Response, map[string]interface{}) {
	return c.do(http.MethodDelete, path, nil)
}

func (c *apiClient) patch(path string, body interface{}) (*http.Response, map[string]interface{}) {
	return c.do(http.MethodPatch, path, body)
}

// assertStatus fails the test if resp.StatusCode != want.
func assertStatus(t *testing.T, resp *http.Response, want int) {
	t.Helper()
	if resp == nil {
		t.Fatalf("nil response — is the server running on %s?", baseURL)
	}
	if resp.StatusCode != want {
		t.Errorf("status: got %d, want %d", resp.StatusCode, want)
	}
}

// assertKey fails if body[key] is nil/missing.
func assertKey(t *testing.T, body map[string]interface{}, key string) {
	t.Helper()
	if body[key] == nil {
		t.Errorf("response missing key %q; body = %v", key, body)
	}
}

// ── Auth tests ────────────────────────────────────────────────────────────────

// TestAuth_Register verifies:
//   - POST /api/auth/local/register → 201
//   - Response shape is flat { jwt, user } (Strapi-compatible, NOT wrapped in { success, data })
//   - user object has id, email, name, status
func TestAuth_Register(t *testing.T) {
	c := newClient()
	email := fmt.Sprintf("test_%s@example.com", testSuffix)

	resp, body := c.post("/api/auth/local/register", map[string]interface{}{
		"username": "testuser_" + testSuffix,
		"email":    email,
		"password": "Test@1234",
		"name":     "Test User",
	})

	assertStatus(t, resp, http.StatusCreated)

	// Must be flat { jwt, user } — NOT { success, data: { jwt, user } }
	assertKey(t, body, "jwt")
	assertKey(t, body, "user")

	user, ok := body["user"].(map[string]interface{})
	if !ok {
		t.Fatalf("user field is not an object: %v", body["user"])
	}
	assertKey(t, user, "id")
	assertKey(t, user, "email")
	assertKey(t, user, "name")
	assertKey(t, user, "status")

	if user["email"] != email {
		t.Errorf("email: got %v, want %v", user["email"], email)
	}
}

// TestAuth_Register_DuplicateEmail verifies 409 on duplicate email.
func TestAuth_Register_DuplicateEmail(t *testing.T) {
	c := newClient()
	email := fmt.Sprintf("dup_%s@example.com", testSuffix)
	payload := map[string]interface{}{
		"username": "dup_" + testSuffix,
		"email":    email,
		"password": "Test@1234",
		"name":     "Dup User",
	}

	resp1, _ := c.post("/api/auth/local/register", payload)
	assertStatus(t, resp1, http.StatusCreated)

	resp2, body2 := c.post("/api/auth/local/register", payload)
	assertStatus(t, resp2, http.StatusConflict)
	assertKey(t, body2, "message")
}

// TestAuth_Register_InvalidPayload verifies 400 on missing required fields.
func TestAuth_Register_InvalidPayload(t *testing.T) {
	c := newClient()
	resp, body := c.post("/api/auth/local/register", map[string]interface{}{
		"email": "nopwd@example.com",
		// missing password and name
	})
	assertStatus(t, resp, http.StatusBadRequest)
	assertKey(t, body, "message")
}

// TestAuth_Login verifies:
//   - POST /api/auth/local → 200
//   - Flat { jwt, user } response shape
func TestAuth_Login(t *testing.T) {
	c := newClient()
	email := fmt.Sprintf("login_%s@example.com", testSuffix)
	password := "Login@1234"

	// First register
	resp, _ := c.post("/api/auth/local/register", map[string]interface{}{
		"username": "login_" + testSuffix,
		"email":    email,
		"password": password,
		"name":     "Login User",
	})
	assertStatus(t, resp, http.StatusCreated)

	// Now login using Strapi-style identifier field
	loginResp, body := c.post("/api/auth/local", map[string]interface{}{
		"identifier": email,
		"password":   password,
	})
	assertStatus(t, loginResp, http.StatusOK)
	assertKey(t, body, "jwt")
	assertKey(t, body, "user")
}

// TestAuth_Login_WrongPassword verifies 401 on bad credentials.
func TestAuth_Login_WrongPassword(t *testing.T) {
	c := newClient()
	resp, body := c.post("/api/auth/local", map[string]interface{}{
		"identifier": "nobody@example.com",
		"password":   "wrong",
	})
	assertStatus(t, resp, http.StatusUnauthorized)
	assertKey(t, body, "message")
}

// TestAuth_Me verifies GET /api/users/me returns current user when authenticated.
func TestAuth_Me(t *testing.T) {
	c := newClient()
	email := fmt.Sprintf("me_%s@example.com", testSuffix)

	regResp, regBody := c.post("/api/auth/local/register", map[string]interface{}{
		"username": "me_" + testSuffix,
		"email":    email,
		"password": "Me@12345",
		"name":     "Me User",
	})
	assertStatus(t, regResp, http.StatusCreated)

	c.token = regBody["jwt"].(string)

	meResp, meBody := c.get("/api/users/me")
	assertStatus(t, meResp, http.StatusOK)

	// /users/me goes through standard { success, data } wrapper — check the data field
	data, ok := meBody["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("/users/me body has no 'data' field: %v", meBody)
	}
	assertKey(t, data, "id")
	assertKey(t, data, "email")
}

// TestAuth_Me_Unauthenticated verifies 401 without token.
func TestAuth_Me_Unauthenticated(t *testing.T) {
	c := newClient()
	resp, _ := c.get("/api/users/me")
	assertStatus(t, resp, http.StatusUnauthorized)
}

// ── Public content tests ──────────────────────────────────────────────────────

// TestPublic_Articles verifies GET /api/public/articles returns a paged response.
// Shape: { "data": [...], "meta": { "pagination": { "page", "pageSize", "pageCount", "total" } } }
func TestPublic_Articles(t *testing.T) {
	c := newClient()
	resp, body := c.get("/api/public/articles?page=0&size=10")
	assertStatus(t, resp, http.StatusOK)

	if _, ok := body["data"]; !ok {
		t.Errorf("response missing 'data' key; body = %v", body)
	}
	meta, ok := body["meta"].(map[string]interface{})
	if !ok {
		t.Fatalf("response missing 'meta' key; body = %v", body)
	}
	pagination, ok := meta["pagination"].(map[string]interface{})
	if !ok {
		t.Fatalf("meta missing 'pagination' key; meta = %v", meta)
	}
	for _, key := range []string{"page", "pageSize", "total"} {
		if pagination[key] == nil {
			t.Errorf("pagination missing key %q", key)
		}
	}
}

// TestPublic_Courses verifies GET /api/public/courses returns a paged response.
// Shape: { "data": [...], "meta": { "pagination": { ... } } }
func TestPublic_Courses(t *testing.T) {
	c := newClient()
	resp, body := c.get("/api/public/courses?page=0&size=10")
	assertStatus(t, resp, http.StatusOK)
	if _, ok := body["data"]; !ok {
		t.Errorf("response missing 'data' key; body = %v", body)
	}
	if _, ok := body["meta"]; !ok {
		t.Errorf("response missing 'meta' key; body = %v", body)
	}
}

// TestPublic_Article_NotFound verifies 404 for unknown article ID.
func TestPublic_Article_NotFound(t *testing.T) {
	c := newClient()
	resp, _ := c.get("/api/public/articles/99999999")
	assertStatus(t, resp, http.StatusNotFound)
}

// TestPublic_Course_NotFound verifies 404 for unknown course ID.
func TestPublic_Course_NotFound(t *testing.T) {
	c := newClient()
	resp, _ := c.get("/api/public/courses/99999999")
	assertStatus(t, resp, http.StatusNotFound)
}

// ── Protected endpoint tests ──────────────────────────────────────────────────

// authToken registers a fresh user and returns their JWT.
func authToken(t *testing.T, suffix string) string {
	t.Helper()
	c := newClient()
	email := fmt.Sprintf("tok_%s@example.com", suffix)
	resp, body := c.post("/api/auth/local/register", map[string]interface{}{
		"username": "tok_" + suffix,
		"email":    email,
		"password": "Tok@12345",
		"name":     "Token User",
	})
	if resp == nil || resp.StatusCode != http.StatusCreated {
		t.Fatalf("authToken: registration failed (status %v)", resp)
	}
	jwt, ok := body["jwt"].(string)
	if !ok || jwt == "" {
		t.Fatalf("authToken: no jwt in response: %v", body)
	}
	return jwt
}

// adminToken logs in as the seeded admin and returns their JWT.
// Used for tests that exercise admin-only endpoints (group/category/user management).
func adminToken(t *testing.T) string {
	t.Helper()
	c := newClient()
	resp, body := c.post("/api/auth/local", map[string]interface{}{
		"identifier": "geekadmin@geekgully.com",
		"password":   "Geekadmin@2026",
	})
	if resp == nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("adminToken: admin login failed (status %v) — is server running with seeded admin?", resp)
	}
	jwt, ok := body["jwt"].(string)
	if !ok || jwt == "" {
		t.Fatalf("adminToken: no jwt in admin login response: %v", body)
	}
	return jwt
}

// TestUsers_GetAll verifies GET /api/users requires auth and returns a paged list.
// Shape: { "data": [...], "meta": { "pagination": { "page", "pageSize", "total" } } }
func TestUsers_GetAll(t *testing.T) {
	c := newClient()

	// Without token → 401
	resp, _ := c.get("/api/users")
	assertStatus(t, resp, http.StatusUnauthorized)

	// With token → 200 with paged envelope
	c.token = authToken(t, testSuffix+"_u")
	resp, body := c.get("/api/users")
	assertStatus(t, resp, http.StatusOK)
	if _, ok := body["data"]; !ok {
		t.Errorf("response missing 'data' key; body = %v", body)
	}
	if _, ok := body["meta"]; !ok {
		t.Errorf("response missing 'meta' key; body = %v", body)
	}
}

// TestGroups_CRUD verifies basic group create / read / update / delete flow.
// Group write operations are admin-only; this test uses the seeded admin account.
func TestGroups_CRUD(t *testing.T) {
	c := newClient()
	c.token = adminToken(t)

	// Create — groups use Strapi-style { data: { name } } wrapper
	createResp, createBody := c.post("/api/user-groups", map[string]interface{}{
		"data": map[string]interface{}{
			"name": "TestGroup_" + testSuffix,
		},
	})
	assertStatus(t, createResp, http.StatusCreated)
	data, ok := createBody["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("create group: no data field: %v", createBody)
	}
	groupID := fmt.Sprintf("%v", data["id"])

	// Read
	getResp, getBody := c.get("/api/user-groups/" + groupID)
	assertStatus(t, getResp, http.StatusOK)
	gdata := getBody["data"].(map[string]interface{})
	if gdata["id"] == nil {
		t.Errorf("get group: missing id")
	}

	// Update — same wrapper
	putResp, _ := c.put("/api/user-groups/"+groupID, map[string]interface{}{
		"data": map[string]interface{}{
			"name": "TestGroup_Updated_" + testSuffix,
		},
	})
	assertStatus(t, putResp, http.StatusOK)

	// Delete
	delResp, _ := c.delete("/api/user-groups/" + groupID)
	assertStatus(t, delResp, http.StatusOK)

	// Confirm deleted → 404
	afterDel, _ := c.get("/api/user-groups/" + groupID)
	assertStatus(t, afterDel, http.StatusNotFound)
}

// TestCategories_CRUD verifies basic category lifecycle.
// Category write operations are admin-only; this test uses the seeded admin account.
func TestCategories_CRUD(t *testing.T) {
	c := newClient()
	c.token = adminToken(t)

	// Create — categories use Strapi-style { data: { name } } wrapper
	createResp, createBody := c.post("/api/categories", map[string]interface{}{
		"data": map[string]interface{}{
			"name": "TestCategory_" + testSuffix,
		},
	})
	assertStatus(t, createResp, http.StatusCreated)
	data := createBody["data"].(map[string]interface{})
	catID := fmt.Sprintf("%v", data["id"])

	// Read
	getResp, _ := c.get("/api/categories/" + catID)
	assertStatus(t, getResp, http.StatusOK)

	// Update — same wrapper
	putResp, _ := c.put("/api/categories/"+catID, map[string]interface{}{
		"data": map[string]interface{}{
			"name": "TestCategory_Updated_" + testSuffix,
		},
	})
	assertStatus(t, putResp, http.StatusOK)

	// Delete
	delResp, _ := c.delete("/api/categories/" + catID)
	assertStatus(t, delResp, http.StatusOK)
}

// TestCMS_CRUD verifies article create / read / update / submit / delete.
func TestCMS_CRUD(t *testing.T) {
	c := newClient()
	c.token = authToken(t, testSuffix+"_cms")

	// Create article — flat payload (no data wrapper), type+title required
	desc := "A test article"
	body := "This is automated test content."
	createResp, createBody := c.post("/api/cms", map[string]interface{}{
		"type":        "article",
		"title":       "Test Article " + testSuffix,
		"description": desc,
		"body":        body,
	})
	assertStatus(t, createResp, http.StatusCreated)
	data := createBody["data"].(map[string]interface{})
	cmsID := fmt.Sprintf("%v", data["id"])

	// Read
	getResp, _ := c.get("/api/cms/" + cmsID)
	assertStatus(t, getResp, http.StatusOK)

	// Update
	putResp, _ := c.put("/api/cms/"+cmsID, map[string]interface{}{
		"title":   "Test Article Updated " + testSuffix,
		"content": "Updated content.",
		"type":    "article",
	})
	assertStatus(t, putResp, http.StatusOK)

	// Submit for review
	submitResp, _ := c.post("/api/cms/"+cmsID+"/submit", nil)
	assertStatus(t, submitResp, http.StatusOK)

	// Delete
	delResp, _ := c.delete("/api/cms/" + cmsID)
	assertStatus(t, delResp, http.StatusOK)
}

// TestNotifications_GetAll verifies GET /api/notifications requires auth and returns a paged list.
// Shape: { "data": [...], "meta": { "pagination": { ... } } }
func TestNotifications_GetAll(t *testing.T) {
	c := newClient()

	resp, _ := c.get("/api/notifications")
	assertStatus(t, resp, http.StatusUnauthorized)

	c.token = authToken(t, testSuffix+"_notif")
	resp, body := c.get("/api/notifications")
	assertStatus(t, resp, http.StatusOK)
	if _, ok := body["data"]; !ok {
		t.Errorf("response missing 'data' key; body = %v", body)
	}
	if _, ok := body["meta"]; !ok {
		t.Errorf("response missing 'meta' key; body = %v", body)
	}
}

// TestTasks_RequiresAuth verifies GET /api/tasks requires auth.
func TestTasks_RequiresAuth(t *testing.T) {
	c := newClient()
	resp, _ := c.get("/api/tasks")
	assertStatus(t, resp, http.StatusUnauthorized)
}

// TestEnrollments_RequiresAuth verifies GET /api/enrollments requires auth.
func TestEnrollments_RequiresAuth(t *testing.T) {
	c := newClient()
	resp, _ := c.get("/api/enrollments")
	assertStatus(t, resp, http.StatusUnauthorized)
}

// TestAnalytics_AdminOnly verifies GET /api/analytics/dashboard requires admin role.
// A freshly registered user has "user" role and should get 403.
func TestAnalytics_AdminOnly(t *testing.T) {
	c := newClient()
	c.token = authToken(t, testSuffix+"_anon")
	resp, _ := c.get("/api/analytics/dashboard")
	// Regular user → 403 Forbidden
	assertStatus(t, resp, http.StatusForbidden)
}
