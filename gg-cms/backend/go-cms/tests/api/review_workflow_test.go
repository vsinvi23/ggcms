package api

// review_workflow_test.go
//
// Two test groups in one file:
//
//  1. TestAuthFlow_*  — covers the full signup → login → /me cycle and every
//     edge case (duplicate email, wrong password, missing fields, token
//     validation).  These run independently of any CMS content.
//
//  2. TestReviewWorkflow_* — covers the publish → edit → review diff workflow
//     for articles and courses.  Every test creates its own throwaway user via
//     setupTestUser(), which itself exercises the register + login flow, so auth
//     is implicitly smoke-tested before every CMS operation.
//
// Each test is self-contained:
//   - creates its own user and content
//   - cleans up both on exit (content first, then user via admin)
//   - leaves the database identical to how it found it
//
// Prerequisites: server on SERVER_URL (default http://localhost:1337).
// Admin credentials via ADMIN_EMAIL / ADMIN_PASSWORD env vars — used only to
// delete test users in t.Cleanup.
//
// Run all:
//
//	go test ./tests/api/... -v -run "TestAuthFlow|TestReviewWorkflow"
//
// Run one group:
//
//	go test ./tests/api/... -v -run TestAuthFlow
//	go test ./tests/api/... -v -run TestReviewWorkflow

import (
	"fmt"
	"os"
	"testing"
)

// ── Admin credentials — optional, only used by TestAuthFlow_AdminLogin ────────
// No other test depends on admin credentials.
// Set ADMIN_EMAIL + ADMIN_PASSWORD env vars to run that one test.

var (
	adminEmail = func() string {
		if v := os.Getenv("ADMIN_EMAIL"); v != "" {
			return v
		}
		return "geekadmin@geekgully.com"
	}()
	adminPassword = func() string {
		if v := os.Getenv("ADMIN_PASSWORD"); v != "" {
			return v
		}
		return "Geekadmin@2026"
	}()
)

// ══════════════════════════════════════════════════════════════════════════════
// Auth mechanism — setupTestUser
//
// Every call to setupTestUser:
//   1. Registers a brand-new user   (exercises POST /api/auth/local/register)
//   2. Logs in with the same creds  (exercises POST /api/auth/local)
//   3. Verifies /api/users/me       (validates the JWT)
//   4. Registers t.Cleanup to delete the user via admin
//
// This means every test that calls setupTestUser is implicitly smoke-testing
// the full signup + login + token-verification flow.
// ══════════════════════════════════════════════════════════════════════════════

type testUser struct {
	client   *apiClient // authenticated as this user
	id       string     // numeric user ID as string  (e.g. "42")
	rawID    float64    // numeric user ID as float64 (for JSON payloads that require a number)
	email    string
	password string
}

func setupTestUser(t *testing.T, label string) *testUser {
	t.Helper()

	email := fmt.Sprintf("tw_%s_%s@test.invalid", label, testSuffix)
	username := fmt.Sprintf("tw_%s_%s", label, testSuffix)
	password := "Testuser@1234"

	// ── Step 1: register ──────────────────────────────────────────────────────
	regC := newClient()
	regResp, regBody := regC.post("/api/auth/local/register", map[string]interface{}{
		"username": username,
		"email":    email,
		"password": password,
		"name":     "Test User " + label,
	})
	if regResp == nil || regResp.StatusCode != 201 {
		t.Fatalf("setupTestUser[%s]: register failed (status %v): %v", label, regResp, regBody)
	}
	if regBody["jwt"] == nil {
		t.Fatalf("setupTestUser[%s]: register returned no jwt: %v", label, regBody)
	}
	userObj, ok := regBody["user"].(map[string]interface{})
	if !ok {
		t.Fatalf("setupTestUser[%s]: register returned no user object: %v", label, regBody)
	}
	rawID, _ := userObj["id"].(float64)
	userID := fmt.Sprintf("%v", userObj["id"])

	// ── Step 2: login with the same credentials ───────────────────────────────
	loginC := newClient()
	loginResp, loginBody := loginC.post("/api/auth/local", map[string]interface{}{
		"identifier": email,
		"password":   password,
	})
	if loginResp == nil || loginResp.StatusCode != 200 {
		t.Fatalf("setupTestUser[%s]: login failed (status %v): %v", label, loginResp, loginBody)
	}
	jwt, ok := loginBody["jwt"].(string)
	if !ok || jwt == "" {
		t.Fatalf("setupTestUser[%s]: login returned no jwt: %v", label, loginBody)
	}
	loginC.token = jwt

	// ── Step 3: verify /api/users/me with the login-derived JWT ──────────────
	meResp, meBody := loginC.get("/api/users/me")
	if meResp == nil || meResp.StatusCode != 200 {
		t.Fatalf("setupTestUser[%s]: /users/me failed (status %v)", label, meResp)
	}
	meData, ok := meBody["data"].(map[string]interface{})
	if !ok || fmt.Sprintf("%v", meData["id"]) != userID {
		t.Fatalf("setupTestUser[%s]: /users/me returned unexpected user: %v", label, meBody)
	}

	// ── Step 4: cleanup — user deletes themselves (no admin required) ─────────
	t.Cleanup(func() {
		loginC.delete("/api/users/" + userID)
	})

	return &testUser{client: loginC, id: userID, rawID: rawID, email: email, password: password}
}

// ── Response helpers ──────────────────────────────────────────────────────────

func cmsID(t *testing.T, body map[string]interface{}) string {
	t.Helper()
	data, ok := body["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("cmsID: no 'data' field: %v", body)
	}
	id := fmt.Sprintf("%v", data["id"])
	if id == "" || id == "0" {
		t.Fatalf("cmsID: id is zero/empty: %v", data)
	}
	return id
}

func cmsData(t *testing.T, body map[string]interface{}) map[string]interface{} {
	t.Helper()
	data, ok := body["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("cmsData: no 'data' field: %v", body)
	}
	return data
}

// ══════════════════════════════════════════════════════════════════════════════
// TestAuthFlow — dedicated auth tests
// ══════════════════════════════════════════════════════════════════════════════

// TestAuthFlow_Register_Success verifies the full registration response shape.
func TestAuthFlow_Register_Success(t *testing.T) {
	email := fmt.Sprintf("reg_ok_%s@test.invalid", testSuffix)
	c := newClient()

	resp, body := c.post("/api/auth/local/register", map[string]interface{}{
		"username": "reg_ok_" + testSuffix,
		"email":    email,
		"password": "Register@1234",
		"name":     "Reg OK User",
	})
	assertStatus(t, resp, 201)
	assertKey(t, body, "jwt")
	assertKey(t, body, "user")

	user, ok := body["user"].(map[string]interface{})
	if !ok {
		t.Fatalf("user is not an object: %v", body["user"])
	}
	for _, field := range []string{"id", "email", "name", "status"} {
		assertKey(t, user, field)
	}
	if user["email"] != email {
		t.Errorf("email: got %v, want %v", user["email"], email)
	}

	// Cleanup: user deletes themselves using the JWT returned at registration
	userID := fmt.Sprintf("%v", user["id"])
	jwt := body["jwt"].(string)
	c.token = jwt
	t.Cleanup(func() { c.delete("/api/users/" + userID) })
}

// TestAuthFlow_Register_DuplicateEmail verifies 409 when the same email is used twice.
func TestAuthFlow_Register_DuplicateEmail(t *testing.T) {
	email := fmt.Sprintf("dup_%s@test.invalid", testSuffix)
	payload := map[string]interface{}{
		"username": "dup_" + testSuffix,
		"email":    email,
		"password": "Dup@12345",
		"name":     "Dup User",
	}

	c := newClient()
	r1, b1 := c.post("/api/auth/local/register", payload)
	assertStatus(t, r1, 201)
	userID := fmt.Sprintf("%v", b1["user"].(map[string]interface{})["id"])
	c.token = b1["jwt"].(string)
	t.Cleanup(func() { c.delete("/api/users/" + userID) })

	r2, b2 := c.post("/api/auth/local/register", payload)
	assertStatus(t, r2, 409)
	assertKey(t, b2, "message")
}

// TestAuthFlow_Register_MissingFields verifies 400 when required fields are absent.
func TestAuthFlow_Register_MissingFields(t *testing.T) {
	c := newClient()
	// missing password and name
	resp, body := c.post("/api/auth/local/register", map[string]interface{}{
		"email": "incomplete@test.invalid",
	})
	assertStatus(t, resp, 400)
	assertKey(t, body, "message")
}

// TestAuthFlow_Login_WithRegisteredCredentials verifies a user can log in after
// registration and the JWT + user fields are correct.
func TestAuthFlow_Login_WithRegisteredCredentials(t *testing.T) {
	u := setupTestUser(t, "login_ok")

	// Attempt a fresh login (setupTestUser already tested one login; this is a second
	// independent call to confirm the endpoint is stable across multiple calls).
	c := newClient()
	resp, body := c.post("/api/auth/local", map[string]interface{}{
		"identifier": u.email,
		"password":   u.password,
	})
	assertStatus(t, resp, 200)
	assertKey(t, body, "jwt")
	assertKey(t, body, "user")

	jwt := body["jwt"].(string)
	if jwt == "" {
		t.Fatal("jwt is empty on second login")
	}

	loginUser, ok := body["user"].(map[string]interface{})
	if !ok {
		t.Fatalf("user not an object: %v", body["user"])
	}
	if fmt.Sprintf("%v", loginUser["id"]) != u.id {
		t.Errorf("user id: got %v, want %v", loginUser["id"], u.id)
	}
}

// TestAuthFlow_Login_WrongPassword verifies 401 when the password is incorrect.
func TestAuthFlow_Login_WrongPassword(t *testing.T) {
	u := setupTestUser(t, "badpwd")

	c := newClient()
	resp, body := c.post("/api/auth/local", map[string]interface{}{
		"identifier": u.email,
		"password":   "definitely-wrong",
	})
	assertStatus(t, resp, 401)
	assertKey(t, body, "message")
}

// TestAuthFlow_Login_UnknownEmail verifies 401 for an email that was never registered.
func TestAuthFlow_Login_UnknownEmail(t *testing.T) {
	c := newClient()
	resp, body := c.post("/api/auth/local", map[string]interface{}{
		"identifier": fmt.Sprintf("ghost_%s@test.invalid", testSuffix),
		"password":   "Ghost@1234",
	})
	assertStatus(t, resp, 401)
	assertKey(t, body, "message")
}

// TestAuthFlow_Me_RequiresAuth verifies GET /api/users/me returns 401 with no token.
func TestAuthFlow_Me_RequiresAuth(t *testing.T) {
	c := newClient() // no token
	resp, _ := c.get("/api/users/me")
	assertStatus(t, resp, 401)
}

// TestAuthFlow_Me_ReturnsCorrectProfile verifies the profile returned by /api/users/me
// matches the registered user's details.
func TestAuthFlow_Me_ReturnsCorrectProfile(t *testing.T) {
	u := setupTestUser(t, "me_profile")

	_, meBody := u.client.get("/api/users/me")
	meData, ok := meBody["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("/users/me no data field: %v", meBody)
	}

	if fmt.Sprintf("%v", meData["id"]) != u.id {
		t.Errorf("id: got %v, want %v", meData["id"], u.id)
	}
	if meData["email"] != u.email {
		t.Errorf("email: got %v, want %v", meData["email"], u.email)
	}
}

// TestAuthFlow_FullCycle walks the complete flow in a single test:
// register → verify registration response → login → verify login response →
// call /users/me → assert all three steps return consistent data.
func TestAuthFlow_FullCycle(t *testing.T) {
	email := fmt.Sprintf("fullcycle_%s@test.invalid", testSuffix)
	password := "FullCycle@1234"

	// ── 1. Register ───────────────────────────────────────────────────────────
	c := newClient()
	regResp, regBody := c.post("/api/auth/local/register", map[string]interface{}{
		"username": "fullcycle_" + testSuffix,
		"email":    email,
		"password": password,
		"name":     "Full Cycle User",
	})
	assertStatus(t, regResp, 201)
	assertKey(t, regBody, "jwt")
	assertKey(t, regBody, "user")

	regUser := regBody["user"].(map[string]interface{})
	userID := fmt.Sprintf("%v", regUser["id"])
	// Cleanup: user deletes themselves using the registration JWT
	regJwt := regBody["jwt"].(string)
	cleanupC := newClient()
	cleanupC.token = regJwt
	t.Cleanup(func() { cleanupC.delete("/api/users/" + userID) })

	if regUser["email"] != email {
		t.Errorf("register: email mismatch: got %v, want %v", regUser["email"], email)
	}

	// ── 2. Login ──────────────────────────────────────────────────────────────
	loginC := newClient()
	loginResp, loginBody := loginC.post("/api/auth/local", map[string]interface{}{
		"identifier": email,
		"password":   password,
	})
	assertStatus(t, loginResp, 200)
	assertKey(t, loginBody, "jwt")

	jwt := loginBody["jwt"].(string)
	if jwt == "" {
		t.Fatal("login: jwt is empty")
	}
	loginUser := loginBody["user"].(map[string]interface{})
	if fmt.Sprintf("%v", loginUser["id"]) != userID {
		t.Errorf("login: user id mismatch: got %v, want %v", loginUser["id"], userID)
	}

	// ── 3. /users/me ──────────────────────────────────────────────────────────
	loginC.token = jwt
	meResp, meBody := loginC.get("/api/users/me")
	assertStatus(t, meResp, 200)

	meData := meBody["data"].(map[string]interface{})
	if fmt.Sprintf("%v", meData["id"]) != userID {
		t.Errorf("/users/me: id mismatch: got %v, want %v", meData["id"], userID)
	}
	if meData["email"] != email {
		t.Errorf("/users/me: email mismatch: got %v, want %v", meData["email"], email)
	}
}

// TestAuthFlow_AdminLogin verifies the seeded admin account is reachable.
func TestAuthFlow_AdminLogin(t *testing.T) {
	c := newClient()
	resp, body := c.post("/api/auth/local", map[string]interface{}{
		"identifier": adminEmail,
		"password":   adminPassword,
	})
	assertStatus(t, resp, 200)
	assertKey(t, body, "jwt")
	assertKey(t, body, "user")

	jwt := body["jwt"].(string)
	if jwt == "" {
		t.Fatal("admin jwt is empty")
	}

	// Validate JWT via /users/me
	c.token = jwt
	meResp, meBody := c.get("/api/users/me")
	assertStatus(t, meResp, 200)

	meData := meBody["data"].(map[string]interface{})
	if meData["email"] != adminEmail {
		t.Errorf("/users/me email: got %v, want %v", meData["email"], adminEmail)
	}
}

// ══════════════════════════════════════════════════════════════════════════════
// CMS lifecycle helpers
// ══════════════════════════════════════════════════════════════════════════════

func publishArticle(t *testing.T, c *apiClient, suffix, body string) string {
	t.Helper()

	cr, cb := c.post("/api/cms", map[string]interface{}{
		"type":        "article",
		"title":       "Test Article " + suffix,
		"description": "Integration test description " + suffix,
		"body":        body,
	})
	assertStatus(t, cr, 201)
	id := cmsID(t, cb)
	t.Cleanup(func() { c.delete("/api/cms/" + id + "?type=ARTICLE") })

	sr, _ := c.post("/api/cms/"+id+"/submit?type=ARTICLE", nil)
	assertStatus(t, sr, 200)
	ar, _ := c.post("/api/cms/"+id+"/approve?type=ARTICLE", nil)
	assertStatus(t, ar, 200)
	// Claim publishing rights: approve clears reviewer_id; non-admin must re-claim before publishing.
	claimR, _ := c.post("/api/cms/"+id+"/claim-review?type=ARTICLE", nil)
	assertStatus(t, claimR, 200)
	pr, _ := c.post("/api/cms/"+id+"/publish?type=ARTICLE", nil)
	assertStatus(t, pr, 200)

	return id
}

func publishCourse(t *testing.T, c *apiClient, suffix, body string) string {
	t.Helper()

	cr, cb := c.post("/api/cms", map[string]interface{}{
		"type":       "COURSE",
		"title":      "Test Course " + suffix,
		"courseType": "STANDARD",
		"body":       body,
	})
	assertStatus(t, cr, 201)
	id := cmsID(t, cb)
	t.Cleanup(func() { c.delete("/api/cms/" + id + "?type=COURSE") })

	sr, _ := c.post("/api/cms/"+id+"/submit?type=COURSE", nil)
	assertStatus(t, sr, 200)
	ar, _ := c.post("/api/cms/"+id+"/approve?type=COURSE", nil)
	assertStatus(t, ar, 200)
	// Claim publishing rights: approve clears reviewer_id; non-admin must re-claim before publishing.
	claimR, _ := c.post("/api/cms/"+id+"/claim-review?type=COURSE", nil)
	assertStatus(t, claimR, 200)
	pr, _ := c.post("/api/cms/"+id+"/publish?type=COURSE", nil)
	assertStatus(t, pr, 200)

	return id
}

// ══════════════════════════════════════════════════════════════════════════════
// TestReviewWorkflow — publish → edit → diff tests
//
// Each test calls setupTestUser, which exercises register + login + /users/me
// before any CMS operation starts.
// ══════════════════════════════════════════════════════════════════════════════

// TestReviewWorkflow_Article_PublishedBodyIsPreservedAfterEdit is the primary
// regression test for the SaveSnapshot / GORM-overwrite bug.
func TestReviewWorkflow_Article_PublishedBodyIsPreservedAfterEdit(t *testing.T) {
	u := setupTestUser(t, "art_snap")
	c := u.client
	suffix := testSuffix + "_art_snap"

	origBody := `[{"id":"b1","type":"paragraph","content":"Original published content v1."}]`
	newBody := `[{"id":"b2","type":"paragraph","content":"Updated draft content v2."}]`

	id := publishArticle(t, c, suffix, origBody)

	er, _ := c.put("/api/cms/"+id+"?type=ARTICLE", map[string]interface{}{
		"title": "Test Article " + suffix + " (edited)",
		"body":  newBody,
	})
	assertStatus(t, er, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=ARTICLE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["status"] != "DRAFT" {
		t.Errorf("status: got %v, want DRAFT", data["status"])
	}
	if data["hasPendingDraft"] != true {
		t.Errorf("hasPendingDraft: got %v, want true", data["hasPendingDraft"])
	}
	if data["publishedBody"] == nil {
		t.Fatal("publishedBody is nil — GORM overwrite bug not fixed")
	}
	if data["publishedBody"].(string) != origBody {
		t.Errorf("publishedBody mismatch:\n  got  %q\n  want %q", data["publishedBody"], origBody)
	}
	if data["body"] == nil || data["body"].(string) != newBody {
		t.Errorf("body mismatch:\n  got  %v\n  want %q", data["body"], newBody)
	}
}

// TestReviewWorkflow_Article_AllSnapshotFieldsPopulated verifies title, body,
// and version are all preserved when a published article is edited.
func TestReviewWorkflow_Article_AllSnapshotFieldsPopulated(t *testing.T) {
	u := setupTestUser(t, "art_allfields")
	c := u.client
	suffix := testSuffix + "_art_allfields"

	origBody := `[{"id":"c1","type":"heading1","content":"Chapter 1"}]`
	id := publishArticle(t, c, suffix, origBody)

	er, _ := c.put("/api/cms/"+id+"?type=ARTICLE", map[string]interface{}{
		"title":       "Revised Title " + suffix,
		"description": "Revised description",
		"body":        `[{"id":"c2","type":"paragraph","content":"Revised body."}]`,
	})
	assertStatus(t, er, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=ARTICLE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	for _, field := range []string{"publishedBody", "publishedTitle", "publishedVersion"} {
		if data[field] == nil {
			t.Errorf("snapshot field %q is nil — should have been preserved", field)
		}
	}
	wantTitle := "Test Article " + suffix
	if data["publishedTitle"].(string) != wantTitle {
		t.Errorf("publishedTitle: got %q, want %q", data["publishedTitle"], wantTitle)
	}
	if data["publishedBody"].(string) != origBody {
		t.Errorf("publishedBody: got %q, want %q", data["publishedBody"], origBody)
	}
}

// TestReviewWorkflow_Article_DraftEditDoesNotCreateSnapshot verifies that editing
// a never-published DRAFT does NOT set publishedBody or hasPendingDraft.
func TestReviewWorkflow_Article_DraftEditDoesNotCreateSnapshot(t *testing.T) {
	u := setupTestUser(t, "art_draftsnap")
	c := u.client
	suffix := testSuffix + "_art_draftsnap"

	cr, cb := c.post("/api/cms", map[string]interface{}{
		"type":  "article",
		"title": "Draft Only " + suffix,
		"body":  `[{"id":"d1","type":"paragraph","content":"Draft body."}]`,
	})
	assertStatus(t, cr, 201)
	id := cmsID(t, cb)
	t.Cleanup(func() { c.delete("/api/cms/" + id + "?type=ARTICLE") })

	er, _ := c.put("/api/cms/"+id+"?type=ARTICLE", map[string]interface{}{
		"body": `[{"id":"d2","type":"paragraph","content":"Edited draft."}]`,
	})
	assertStatus(t, er, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=ARTICLE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["publishedBody"] != nil {
		t.Errorf("publishedBody should be nil for never-published content, got %v", data["publishedBody"])
	}
	if data["hasPendingDraft"] == true {
		t.Error("hasPendingDraft should be false for a plain DRAFT edit")
	}
}

// TestReviewWorkflow_Article_SubmitAfterEditCarriesSnapshot verifies the snapshot
// survives submit so the reviewer can diff against the published baseline.
func TestReviewWorkflow_Article_SubmitAfterEditCarriesSnapshot(t *testing.T) {
	u := setupTestUser(t, "art_subedit")
	c := u.client
	suffix := testSuffix + "_art_subedit"

	origBody := `[{"id":"e1","type":"paragraph","content":"Published content."}]`
	newBody := `[{"id":"e2","type":"paragraph","content":"Submitted revision."}]`

	id := publishArticle(t, c, suffix, origBody)

	er, _ := c.put("/api/cms/"+id+"?type=ARTICLE", map[string]interface{}{"body": newBody})
	assertStatus(t, er, 200)

	sr, _ := c.post("/api/cms/"+id+"/submit?type=ARTICLE", nil)
	assertStatus(t, sr, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=ARTICLE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["status"] != "REVIEW" {
		t.Errorf("status: got %v, want REVIEW", data["status"])
	}
	if data["publishedBody"] == nil {
		t.Fatal("publishedBody is nil after submit — reviewer cannot see diff")
	}
	if data["publishedBody"].(string) != origBody {
		t.Errorf("publishedBody after submit: got %q, want %q", data["publishedBody"], origBody)
	}
	if data["body"].(string) != newBody {
		t.Errorf("current body after submit: got %q, want %q", data["body"], newBody)
	}
}

// TestReviewWorkflow_Article_SnapshotClearedAfterRePublish verifies that a second
// publish cycle clears hasPendingDraft and publishedBody.
func TestReviewWorkflow_Article_SnapshotClearedAfterRePublish(t *testing.T) {
	u := setupTestUser(t, "art_repub")
	c := u.client
	suffix := testSuffix + "_art_repub"

	id := publishArticle(t, c, suffix, `[{"id":"f1","type":"paragraph","content":"v1 body."}]`)

	er, _ := c.put("/api/cms/"+id+"?type=ARTICLE", map[string]interface{}{
		"body": `[{"id":"f2","type":"paragraph","content":"v2 body."}]`,
	})
	assertStatus(t, er, 200)

	sr, _ := c.post("/api/cms/"+id+"/submit?type=ARTICLE", nil)
	assertStatus(t, sr, 200)
	ar, _ := c.post("/api/cms/"+id+"/approve?type=ARTICLE", nil)
	assertStatus(t, ar, 200)
	claimR, _ := c.post("/api/cms/"+id+"/claim-review?type=ARTICLE", nil)
	assertStatus(t, claimR, 200)
	pr, _ := c.post("/api/cms/"+id+"/publish?type=ARTICLE", nil)
	assertStatus(t, pr, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=ARTICLE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["status"] != "PUBLISHED" {
		t.Errorf("status: got %v, want PUBLISHED", data["status"])
	}
	if data["hasPendingDraft"] == true {
		t.Error("hasPendingDraft should be false after re-publish")
	}
	if data["publishedBody"] != nil {
		t.Errorf("publishedBody should be nil after re-publish, got %v", data["publishedBody"])
	}
}

// TestReviewWorkflow_Article_MultipleEditsPreserveFirstPublishedSnapshot verifies
// that successive DRAFT edits do not overwrite the original published snapshot.
func TestReviewWorkflow_Article_MultipleEditsPreserveFirstPublishedSnapshot(t *testing.T) {
	u := setupTestUser(t, "art_multiedit")
	c := u.client
	suffix := testSuffix + "_art_multiedit"

	origBody := `[{"id":"g1","type":"paragraph","content":"Published v1."}]`
	id := publishArticle(t, c, suffix, origBody)

	er1, _ := c.put("/api/cms/"+id+"?type=ARTICLE", map[string]interface{}{
		"body": `[{"id":"g2","type":"paragraph","content":"Intermediate draft."}]`,
	})
	assertStatus(t, er1, 200)

	er2, _ := c.put("/api/cms/"+id+"?type=ARTICLE", map[string]interface{}{
		"body": `[{"id":"g3","type":"paragraph","content":"Final draft before submit."}]`,
	})
	assertStatus(t, er2, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=ARTICLE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["publishedBody"] == nil {
		t.Fatal("publishedBody is nil after second edit")
	}
	if data["publishedBody"].(string) != origBody {
		t.Errorf("publishedBody must hold the original published version:\n  got  %q\n  want %q",
			data["publishedBody"], origBody)
	}
}

// ── Course diff ───────────────────────────────────────────────────────────────

// TestReviewWorkflow_Course_PublishedBodyIsPreservedAfterEdit mirrors the article
// test for the course code path.
func TestReviewWorkflow_Course_PublishedBodyIsPreservedAfterEdit(t *testing.T) {
	u := setupTestUser(t, "crs_snap")
	c := u.client
	suffix := testSuffix + "_crs_snap"

	origBody := `[{"id":"h1","type":"paragraph","content":"Course intro v1."}]`
	newBody := `[{"id":"h2","type":"paragraph","content":"Course intro v2."}]`

	id := publishCourse(t, c, suffix, origBody)

	er, _ := c.put("/api/cms/"+id+"?type=COURSE", map[string]interface{}{
		"title": "Test Course " + suffix + " (edited)",
		"body":  newBody,
	})
	assertStatus(t, er, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=COURSE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["status"] != "DRAFT" {
		t.Errorf("status: got %v, want DRAFT", data["status"])
	}
	if data["hasPendingDraft"] != true {
		t.Errorf("hasPendingDraft: got %v, want true", data["hasPendingDraft"])
	}
	if data["publishedBody"] == nil {
		t.Fatal("course publishedBody is nil — GORM overwrite bug not fixed for courses")
	}
	if data["publishedBody"].(string) != origBody {
		t.Errorf("course publishedBody:\n  got  %q\n  want %q", data["publishedBody"], origBody)
	}
	if data["body"].(string) != newBody {
		t.Errorf("course body:\n  got  %q\n  want %q", data["body"], newBody)
	}
}

// TestReviewWorkflow_Course_SubmitAfterEditCarriesSnapshot verifies snapshot
// survives submit for courses.
func TestReviewWorkflow_Course_SubmitAfterEditCarriesSnapshot(t *testing.T) {
	u := setupTestUser(t, "crs_subedit")
	c := u.client
	suffix := testSuffix + "_crs_subedit"

	origBody := `[{"id":"i1","type":"paragraph","content":"Course published."}]`
	newBody := `[{"id":"i2","type":"paragraph","content":"Course revised."}]`

	id := publishCourse(t, c, suffix, origBody)

	er, _ := c.put("/api/cms/"+id+"?type=COURSE", map[string]interface{}{"body": newBody})
	assertStatus(t, er, 200)

	sr, _ := c.post("/api/cms/"+id+"/submit?type=COURSE", nil)
	assertStatus(t, sr, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=COURSE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["status"] != "REVIEW" {
		t.Errorf("status: got %v, want REVIEW", data["status"])
	}
	if data["publishedBody"] == nil {
		t.Fatal("course publishedBody is nil after submit — reviewer cannot diff")
	}
	if data["publishedBody"].(string) != origBody {
		t.Errorf("course publishedBody:\n  got  %q\n  want %q", data["publishedBody"], origBody)
	}
}

// TestReviewWorkflow_Course_SnapshotClearedAfterRePublish confirms the snapshot
// is cleared after a second publish cycle for courses.
func TestReviewWorkflow_Course_SnapshotClearedAfterRePublish(t *testing.T) {
	u := setupTestUser(t, "crs_repub")
	c := u.client
	suffix := testSuffix + "_crs_repub"

	id := publishCourse(t, c, suffix, `[{"id":"j1","type":"paragraph","content":"Course v1."}]`)

	er, _ := c.put("/api/cms/"+id+"?type=COURSE", map[string]interface{}{
		"body": `[{"id":"j2","type":"paragraph","content":"Course v2."}]`,
	})
	assertStatus(t, er, 200)

	c.post("/api/cms/"+id+"/submit?type=COURSE", nil)
	c.post("/api/cms/"+id+"/approve?type=COURSE", nil)
	c.post("/api/cms/"+id+"/claim-review?type=COURSE", nil)
	c.post("/api/cms/"+id+"/publish?type=COURSE", nil)

	gr, gb := c.get("/api/cms/" + id + "?type=COURSE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["status"] != "PUBLISHED" {
		t.Errorf("status: got %v, want PUBLISHED", data["status"])
	}
	if data["hasPendingDraft"] == true {
		t.Error("course hasPendingDraft should be false after re-publish")
	}
	if data["publishedBody"] != nil {
		t.Errorf("course publishedBody should be nil after re-publish, got %v", data["publishedBody"])
	}
}

// ── Reject / send-back ────────────────────────────────────────────────────────

// TestReviewWorkflow_Article_RejectSetsStatusRejected verifies reject moves the
// article to REJECTED status with the reviewer comment attached.
// Note: SendBack (not Reject) drives content back to DRAFT for revision.
func TestReviewWorkflow_Article_RejectSetsStatusRejected(t *testing.T) {
	u := setupTestUser(t, "art_reject")
	c := u.client
	suffix := testSuffix + "_art_reject"

	cr, cb := c.post("/api/cms", map[string]interface{}{
		"type":  "article",
		"title": "Reject Test " + suffix,
		"body":  `[{"id":"k1","type":"paragraph","content":"Body."}]`,
	})
	assertStatus(t, cr, 201)
	id := cmsID(t, cb)
	t.Cleanup(func() { c.delete("/api/cms/" + id + "?type=ARTICLE") })

	c.post("/api/cms/"+id+"/submit?type=ARTICLE", nil)

	rr, _ := c.post("/api/cms/"+id+"/reject?type=ARTICLE", map[string]interface{}{
		"reviewerId": u.rawID, // must be a JSON number, not a string
		"comment":    "Needs more detail",
	})
	assertStatus(t, rr, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=ARTICLE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["status"] != "REJECTED" {
		t.Errorf("status after reject: got %v, want REJECTED", data["status"])
	}
	if data["reviewerComment"] == nil || data["reviewerComment"].(string) != "Needs more detail" {
		t.Errorf("reviewerComment: got %v, want %q", data["reviewerComment"], "Needs more detail")
	}
}

// TestReviewWorkflow_Article_SendBackPreservesReviewBaseline verifies send-back
// writes reviewBaselineBody for the next reviewer to diff against.
func TestReviewWorkflow_Article_SendBackPreservesReviewBaseline(t *testing.T) {
	u := setupTestUser(t, "art_sendback")
	c := u.client
	suffix := testSuffix + "_art_sendback"

	cr, cb := c.post("/api/cms", map[string]interface{}{
		"type":  "article",
		"title": "SendBack Test " + suffix,
		"body":  `[{"id":"l1","type":"paragraph","content":"First submission."}]`,
	})
	assertStatus(t, cr, 201)
	id := cmsID(t, cb)
	t.Cleanup(func() { c.delete("/api/cms/" + id + "?type=ARTICLE") })

	c.post("/api/cms/"+id+"/submit?type=ARTICLE", nil)
	// Claim review so this user becomes the assigned reviewer before sending back.
	claimR, _ := c.post("/api/cms/"+id+"/claim-review?type=ARTICLE", nil)
	assertStatus(t, claimR, 200)

	sbr, _ := c.post("/api/cms/"+id+"/send-back?type=ARTICLE", map[string]interface{}{
		"comment": "Please improve the introduction",
	})
	assertStatus(t, sbr, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=ARTICLE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["status"] != "DRAFT" {
		t.Errorf("status after send-back: got %v, want DRAFT", data["status"])
	}
	if data["reviewBaselineBody"] == nil {
		t.Error("reviewBaselineBody is nil after send-back — second reviewer cannot diff")
	}
}

// ── Claim review ──────────────────────────────────────────────────────────────

// TestReviewWorkflow_Article_ClaimReviewSetsReviewer verifies that a user can
// self-assign via POST /cms/:id/claim-review.
func TestReviewWorkflow_Article_ClaimReviewSetsReviewer(t *testing.T) {
	u := setupTestUser(t, "art_claim")
	c := u.client
	suffix := testSuffix + "_art_claim"

	cr, cb := c.post("/api/cms", map[string]interface{}{
		"type":  "article",
		"title": "ClaimReview Test " + suffix,
		"body":  `[{"id":"m1","type":"paragraph","content":"Body."}]`,
	})
	assertStatus(t, cr, 201)
	id := cmsID(t, cb)
	t.Cleanup(func() { c.delete("/api/cms/" + id + "?type=ARTICLE") })

	c.post("/api/cms/"+id+"/submit?type=ARTICLE", nil)

	claimResp, _ := c.post("/api/cms/"+id+"/claim-review?type=ARTICLE", nil)
	assertStatus(t, claimResp, 200)

	gr, gb := c.get("/api/cms/" + id + "?type=ARTICLE")
	assertStatus(t, gr, 200)
	data := cmsData(t, gb)

	if data["reviewerId"] == nil {
		t.Error("reviewerId is nil after claim-review — self-assign did not work")
	}
	if data["status"] != "REVIEW" {
		t.Errorf("status: got %v, want REVIEW", data["status"])
	}
}
