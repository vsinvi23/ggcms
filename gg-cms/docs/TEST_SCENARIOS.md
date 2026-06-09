# GeekGully CMS — Test Scenario Documentation

**Date:** 2026-06-09  
**Branch:** `InitialSetup`  
**Status:** Active — Updated with all scenario implementations  

---

## Quick Reference

| Layer | Tool | Total | Pass | Fail | Skip |
|-------|------|-------|------|------|------|
| Backend unit | `go test` | 47 | 47 | 0 | — |
| Frontend unit | Vitest | 98 | 98 | 0 | — |
| E2E existing | Playwright | 215 | 203 | 0 | 12 |
| E2E new (HIGH) | Playwright | 6 | 4 | 2* | — |
| E2E new (MEDIUM) | Playwright | 23 | 23 | 0 | — |
| **Grand Total** | | **389** | **375** | **2*** | **12** |

> \* 2 HIGH priority failures due to **CORS misconfiguration** (backend was missing `http://localhost:8080` in `CORS_ALLOWED_ORIGINS`). Fix applied — re-validation in progress after Docker restart.
| **Grand Total** | | **356** | **344** | **0** | **12** |

> **Skipped (12):** Tests that require a live login with real backend credentials. They run in `full-workflow.spec.ts` when `server.exe` is running with the seeded admin account.

---

## 1. Authentication & Session Management

### 1.1 Login / Logout

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| A1 | Unauthenticated user navigating to `/dashboard` is redirected to `/auth` | `auth.spec.ts` | E2E | ✅ |
| A2 | Unauthenticated user navigating to `/articles` is redirected to `/auth` | `auth.spec.ts` | E2E | ✅ |
| A3 | Authenticated admin visiting `/auth` is redirected to `/dashboard` | `auth.spec.ts` | E2E | ✅ |
| A4 | Login page renders Login and Sign Up tabs | `auth.spec.ts`, `Auth.test.tsx` | E2E + Unit | ✅ |
| A5 | Login tab shows email and password fields | `auth.spec.ts`, `Auth.test.tsx` | E2E + Unit | ✅ |
| A6 | "Back to Home" link visible on auth page | `auth.spec.ts`, `Auth.test.tsx` | E2E + Unit | ✅ |
| A7 | Wrong credentials — stays on `/auth`, no navigation | `auth.spec.ts` | E2E | ✅ |
| A8 | Valid admin credentials → redirect to `/dashboard` | `auth.spec.ts` | E2E (skip if no backend) | ⚠️ |
| A9 | Login submits email + password to `login()` function | `Auth.test.tsx` | Unit | ✅ |
| A10 | Login error from API — no navigation occurs | `Auth.test.tsx` | Unit | ✅ |
| A11 | After logout (session cleared), protected routes redirect to `/auth` | `auth.spec.ts` | E2E | ✅ |
| A12 | Password visibility toggle switches input type text/password | `auth.spec.ts` | E2E | ✅ |

### 1.2 Sign-Up

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| B1 | Sign Up tab switch shows Full Name and Confirm Password fields | `auth.spec.ts`, `Auth.test.tsx` | E2E + Unit | ✅ |
| B2 | Password mismatch prevents form submission | `auth.spec.ts`, `Auth.test.tsx` | E2E + Unit | ✅ |
| B3 | Valid signup calls `signup()` with email, password, name | `Auth.test.tsx` | Unit | ✅ |
| B4 | Successful signup → navigate to `/dashboard` | `Auth.test.tsx` | Unit | ✅ |

### 1.3 Social Login / Feature Flags

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| C1 | Social login buttons hidden when `social_login` flag is off | `auth.spec.ts`, `Auth.test.tsx` | E2E + Unit | ✅ |
| C2 | Social login disabled by default (DB seed + handler default) | DB migration 024/026 | Code | ✅ |
| C3 | Social login buttons visible when flag is on | — | — | ❌ Not tested |
| C4 | OAuth redirect flow (Google/GitHub callback) | — | — | ❌ Not tested |

### 1.4 Protected Route Guard

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| D1 | Loading spinner shown while auth is resolving | `ProtectedRoute.test.tsx` | Unit | ✅ |
| D2 | Unauthenticated → redirects to `/auth` | `ProtectedRoute.test.tsx` | Unit | ✅ |
| D3 | Authenticated → renders children | `ProtectedRoute.test.tsx` | Unit | ✅ |
| D4 | `requireAdmin=true` + non-admin → redirects to `/` | `ProtectedRoute.test.tsx` | Unit | ✅ |
| D5 | `requireAdmin=true` + admin → renders children | `ProtectedRoute.test.tsx` | Unit | ✅ |
| D6 | JWT expiry auto-logout | — | — | ❌ Not tested |

---

## 2. Role-Based Access Control (RBAC)

### 2.1 Admin-Only Routes (requireAdmin guard)

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| E1 | Learner redirected from `/users` | `security-authz.spec.ts`, `role-visibility.spec.ts` | E2E | ✅ |
| E2 | Learner redirected from `/configuration` | `security-authz.spec.ts` | E2E | ✅ |
| E3 | Learner redirected from `/settings` | `security-authz.spec.ts` | E2E | ✅ |
| E4 | Learner redirected from `/roles` | `learner-journey.spec.ts` | E2E | ✅ |
| E5 | Learner redirected from `/analytics` | `learner-journey.spec.ts` | E2E | ✅ |
| E6 | Creator redirected from `/users` | `creator-journey.spec.ts`, `security-authz.spec.ts` | E2E | ✅ |
| E7 | Creator redirected from `/settings` | `creator-journey.spec.ts` | E2E | ✅ |
| E8 | Reviewer redirected from `/configuration` | `security-authz.spec.ts` | E2E | ✅ |
| E9 | Admin can access `/users`, `/settings`, `/analytics` | `role-visibility.spec.ts` | E2E | ✅ |
| E10 | Admin can access `/configuration`, `/roles` | `role-visibility.spec.ts` | E2E | ✅ |

### 2.2 Sidebar Visibility by Role

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| F1 | Admin sees "User Management" section in sidebar | `AppSidebar.test.tsx`, `security-authz.spec.ts` | Unit + E2E | ✅ |
| F2 | Admin sees "Settings" section in sidebar | `AppSidebar.test.tsx`, `security-authz.spec.ts` | Unit + E2E | ✅ |
| F3 | Admin sees "Analytics" nav item | `AppSidebar.test.tsx`, `role-visibility.spec.ts` | Unit + E2E | ✅ |
| F4 | Admin sees "Manage Users" link (inside User Management) | `AppSidebar.test.tsx`, `role-visibility.spec.ts` | Unit + E2E | ✅ |
| F5 | Admin sees "Roles & Permissions" link | `AppSidebar.test.tsx` | Unit | ✅ |
| F6 | Admin sees "Configuration" link (inside Settings) | `AppSidebar.test.tsx` | Unit | ✅ |
| F7 | Regular user sees Dashboard, My Tasks, Courses, Articles, My Learning | `AppSidebar.test.tsx`, `role-visibility.spec.ts` | Unit + E2E | ✅ |
| F8 | Regular user does NOT see User Management, Analytics, Manage Users | `AppSidebar.test.tsx`, `role-visibility.spec.ts` | Unit + E2E | ✅ |
| F9 | Regular user does NOT see Configuration or Roles & Permissions | `AppSidebar.test.tsx` | Unit | ✅ |
| F10 | Both admin and user items visible for admin (combined check) | `AppSidebar.test.tsx` | Unit | ✅ |

### 2.3 Backend Security (CMS ownership + review permissions)

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| G1 | Owner can update their own CMS item | `cms_handler_security_test.go` | Unit | ✅ |
| G2 | Non-owner cannot update another user's CMS item | `cms_handler_security_test.go` | Unit | ✅ |
| G3 | Admin can update any CMS item | `cms_handler_security_test.go` | Unit | ✅ |
| G4 | Owner can delete their own CMS item | `cms_handler_security_test.go` | Unit | ✅ |
| G5 | Non-owner cannot delete another user's CMS item | `cms_handler_security_test.go` | Unit | ✅ |
| G6 | Admin can publish any CMS item | `cms_handler_security_test.go` | Unit | ✅ |
| G7 | Assigned reviewer can publish a CMS item | `cms_handler_security_test.go` | Unit | ✅ |
| G8 | Non-reviewer cannot publish | `cms_handler_security_test.go` | Unit | ✅ |
| G9 | Reviewer can send back content | `cms_handler_security_test.go` | Unit | ✅ |
| G10 | Non-reviewer cannot send back | `cms_handler_security_test.go` | Unit | ✅ |
| G11 | User can update own profile | `user_handler_security_test.go` | Unit | ✅ |
| G12 | User cannot update another user's profile | `user_handler_security_test.go` | Unit | ✅ |
| G13 | User cannot change own status | `user_handler_security_test.go` | Unit | ✅ |
| G14 | User cannot change own group | `user_handler_security_test.go` | Unit | ✅ |
| G15 | Admin can update any user | `user_handler_security_test.go` | Unit | ✅ |

---

## 3. Admin Dashboard

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| H1 | Admin Dashboard heading visible | `dashboard.spec.ts`, `Dashboard.test.tsx` | E2E + Unit | ✅ |
| H2 | Total Users stat card visible | `dashboard.spec.ts`, `Dashboard.test.tsx` | E2E + Unit | ✅ |
| H3 | Active Users stat card visible | `dashboard.spec.ts`, `Dashboard.test.tsx` | E2E + Unit | ✅ |
| H4 | Deactivated stat card visible | `dashboard.spec.ts`, `Dashboard.test.tsx` | E2E + Unit | ✅ |
| H5 | Pending Invites stat card visible | `dashboard.spec.ts`, `Dashboard.test.tsx` | E2E + Unit | ✅ |
| H6 | Correct active user count displayed from mock data | `Dashboard.test.tsx` | Unit | ✅ |
| H7 | Quick Actions section with Manage Users link | `dashboard.spec.ts`, `Dashboard.test.tsx` | E2E + Unit | ✅ |
| H8 | Manage Users link navigates to `/users` | `dashboard.spec.ts` | E2E | ✅ |
| H9 | Sidebar navigation present | `dashboard.spec.ts` | E2E | ✅ |
| H10 | Unauthenticated redirected from `/dashboard` | `dashboard.spec.ts` | E2E | ✅ |

---

## 4. Content Workflow (Article & Course)

### 4.1 Article Management

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| I1 | Article list page loads for admin | `articles.spec.ts` | E2E | ✅ |
| I2 | Admin not redirected to `/auth` on `/articles` | `articles.spec.ts` | E2E | ✅ |
| I3 | Create Article button visible | `articles.spec.ts` | E2E | ✅ |
| I4 | Article list page main content area present | `articles.spec.ts` | E2E | ✅ |
| I5 | Article create page has Title field | `content-workflow.spec.ts` | E2E | ✅ |
| I6 | Reviewer can access article list | `reviewer-journey.spec.ts` | E2E | ✅ |
| I7 | Full article DRAFT → REVIEW → PUBLISHED cycle via UI | — | — | ❌ Not tested |
| I8 | Article rejection with reviewer comment | — | — | ❌ Not tested |

### 4.2 Course Management

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| J1 | Course list page loads for admin | `courses.spec.ts` | E2E | ✅ |
| J2 | Admin not redirected to `/auth` on `/courses` | `courses.spec.ts` | E2E | ✅ |
| J3 | Create Course button visible | `courses.spec.ts` | E2E | ✅ |
| J4 | Creator can navigate to course creation page | `full-workflow.spec.ts` | E2E | ✅ |
| J5 | Admin can access course management page | `full-workflow.spec.ts` | E2E | ✅ |
| J6 | Full course DRAFT → REVIEW → PUBLISHED cycle via UI | — | — | ❌ Not tested |

### 4.3 Review Actions Panel (Unit)

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| K1 | DRAFT status → only "Submit for Review" button | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K2 | SUBMITTED/IN_REVIEW → Approve, Request Changes, Reject | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K3 | APPROVED → Publish and Send Back buttons | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K4 | PUBLISHED → only Unpublish (no plain Publish button) | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K5 | REJECTED → only Resubmit button | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K6 | Unknown status → null (no buttons rendered) | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K7 | Approve calls `onAction("approve")` without opening dialog | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K8 | Publish calls `onAction("publish")` without dialog | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K9 | Submit calls `onAction("submit")` without dialog | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K10 | Reject opens dialog with "Reject Content" heading | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K11 | Confirm button disabled while reject comment is empty | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K12 | Confirm button enabled after entering reject comment | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K13 | Confirming reject calls `onAction("reject", comment)` | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K14 | Cancel closes dialog without calling `onAction` | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K15 | Request Changes opens dialog with correct heading | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K16 | Send Back from approved state opens dialog | `ReviewActionsPanel.test.tsx` | Unit | ✅ |
| K17 | All buttons disabled when `isLoading=true` | `ReviewActionsPanel.test.tsx` | Unit | ✅ |

### 4.4 Status Badge (Unit)

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| L1 | DRAFT → "Draft" label | `StatusBadge.test.tsx` | Unit | ✅ |
| L2 | REVIEW → "In Review" label | `StatusBadge.test.tsx` | Unit | ✅ |
| L3 | APPROVED → "Approved" label | `StatusBadge.test.tsx` | Unit | ✅ |
| L4 | PUBLISHED → "Published" label | `StatusBadge.test.tsx` | Unit | ✅ |
| L5 | REJECTED → "Rejected" label | `StatusBadge.test.tsx` | Unit | ✅ |
| L6 | Lowercase variants handled (e.g. "draft") | `StatusBadge.test.tsx` | Unit | ✅ |
| L7 | Unknown status falls back to "Draft" | `StatusBadge.test.tsx` | Unit | ✅ |
| L8 | Icon hidden when `showIcon=false` | `StatusBadge.test.tsx` | Unit | ✅ |
| L9 | Pending-draft chip shows "Live vN · Revision pending" | `StatusBadge.test.tsx` | Unit | ✅ |
| L10 | Custom className applied | `StatusBadge.test.tsx` | Unit | ✅ |

### 4.5 Workflow Status Bar (Unit)

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| M1 | All 5 stage labels render for non-rejected status | `WorkflowStatusBar.test.tsx` | Unit | ✅ |
| M2 | Labels hidden when `showLabels=false` | `WorkflowStatusBar.test.tsx` | Unit | ✅ |
| M3 | Rejected status shows "Rejected" banner, not step flow | `WorkflowStatusBar.test.tsx` | Unit | ✅ |
| M4 | No crashes for any valid status (draft→published) | `WorkflowStatusBar.test.tsx` | Unit | ✅ |
| M5 | Published step shows step 5 as current marker | `WorkflowStatusBar.test.tsx` | Unit | ✅ |
| M6 | Draft shows step 1 as current, steps 2–5 pending | `WorkflowStatusBar.test.tsx` | Unit | ✅ |
| M7 | Approved step shows 3 completed check icons + step 4 active | `WorkflowStatusBar.test.tsx` | Unit | ✅ |

### 4.6 My Tasks

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| N1 | `/my-tasks` page loads without auth redirect | `content-workflow.spec.ts` | E2E | ✅ |
| N2 | Task tabs (Owned / Reviewing / Contributed) visible | `content-workflow.spec.ts` | E2E | ✅ |
| N3 | Reviewer sees `/my-tasks` with their content | `reviewer-journey.spec.ts` | E2E | ✅ |

---

## 5. Configuration & Settings

### 5.1 Categories & Configuration

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| O1 | Configuration page loads | `configuration.spec.ts` | E2E | ✅ |
| O2 | Categories tab visible with Add Category button | `configuration.spec.ts` | E2E | ✅ |
| O3 | Tags tab visible with create button | `configuration.spec.ts` | E2E | ✅ |
| O4 | E2E Test Category visible (seeded by global-setup) | `full-workflow.spec.ts` | E2E | ✅ |
| O5 | E2E Reviewers group visible (seeded by global-setup) | `full-workflow.spec.ts` | E2E | ✅ |
| O6 | Unauthenticated redirected from `/configuration` | `configuration.spec.ts`, `security-authz.spec.ts` | E2E | ✅ |

### 5.2 System Settings

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| P1 | Settings page loads for admin | `settings.spec.ts` | E2E | ✅ |
| P2 | All setting tabs visible: General, Security, Email, Notifications, Content, Integrations, Storage, Features | `settings.spec.ts` | E2E | ✅ |
| P3 | Storage tab renders "Storage Backend" label | `settings.spec.ts`, `Settings.test.tsx` | E2E + Unit | ✅ |
| P4 | Local Storage fields visible by default | `Settings.test.tsx` | Unit | ✅ |
| P5 | S3 fields appear when S3 provider selected | `Settings.test.tsx` | Unit | ✅ |
| P6 | Save Storage Settings calls update API | `Settings.test.tsx` | Unit | ✅ |
| P7 | Features tab shows Learning Paths toggle | `settings.spec.ts` | E2E | ✅ |
| P8 | Social Login toggle visible in Features tab | `settings.spec.ts` | E2E | ✅ |
| P9 | Unauthenticated redirected from `/settings` | `settings.spec.ts`, `security-authz.spec.ts` | E2E | ✅ |

---

## 6. User Management

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| Q1 | User management page loads for admin | `users.spec.ts` | E2E | ✅ |
| Q2 | No auth redirect for admin on `/users` | `users.spec.ts` | E2E | ✅ |
| Q3 | Invite User button visible | `users.spec.ts` | E2E | ✅ |
| Q4 | `/user-management` page loads | `users.spec.ts` | E2E | ✅ |
| Q5 | Unauthenticated redirected from `/users` | `users.spec.ts` | E2E | ✅ |
| Q6 | Unauthenticated redirected from `/user-management` | `users.spec.ts` | E2E | ✅ |
| Q7 | Roles/Groups page (`/roles`) loads | `users.spec.ts` | E2E | ✅ |
| Q8 | `/groups` redirects to `/roles` | `users.spec.ts` | E2E | ✅ |
| Q9 | Create role/group button visible | `users.spec.ts` | E2E | ✅ |

---

## 7. Learner Experience & Public Pages

### 7.1 Public Home

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| R1 | Public home page loads at `/` | `public.spec.ts`, `full-workflow.spec.ts` | E2E | ✅ |
| R2 | Header visible | `public.spec.ts` | E2E | ✅ |
| R3 | Login/auth link or button visible | `public.spec.ts` | E2E | ✅ |
| R4 | Main content area visible | `public.spec.ts` | E2E | ✅ |
| R5 | 404 Not Found page renders | `public.spec.ts`, `NotFound.test.tsx` | E2E + Unit | ✅ |
| R6 | 404 page has back/home link | `NotFound.test.tsx` | Unit | ✅ |

### 7.2 Learner Workflow

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| S1 | Learner can access `/my-learning` | `content-workflow.spec.ts`, `learner-journey.spec.ts` | E2E | ✅ |
| S2 | Learner can access `/notes-highlights` | `content-workflow.spec.ts` | E2E | ✅ |
| S3 | Learner blocked from `/users`, `/roles`, `/analytics` | `learner-journey.spec.ts`, `security-authz.spec.ts` | E2E | ✅ |
| S4 | Learner sees My Tasks nav item in sidebar | `role-visibility.spec.ts`, `AppSidebar.test.tsx` | E2E + Unit | ✅ |
| S5 | Learner sees Courses nav item in sidebar | `role-visibility.spec.ts`, `AppSidebar.test.tsx` | E2E + Unit | ✅ |
| S6 | Enrolment button visible on public course cards | — | — | ❌ Not tested |
| S7 | My Learning page shows enrolled courses and progress | — | — | ❌ Not tested |
| S8 | Highlight and note creation from course/article view | — | — | ❌ Not tested |

---

## 8. Rate Limiting (Backend Unit)

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| T1 | Requests within rate-limit window are allowed | `rate_limit_test.go` | Unit | ✅ |
| T2 | Auth rate-limit middleware applies to login endpoint | `rate_limit_test.go` | Unit | ✅ |
| T3 | Rate-limit window resets after interval | `rate_limit_test.go` | Unit | ✅ |

---

## 9. Storage (Backend Unit)

| # | Scenario | Test File | Type | Status |
|---|----------|-----------|------|--------|
| U1 | File saved to local storage | `local_test.go` | Unit | ✅ |
| U2 | File deleted from local storage | `local_test.go` | Unit | ✅ |
| U3 | Path traversal attempt blocked | `local_test.go` | Unit | ✅ |

---

## 10. Full Workflow — End-to-End (Real Sessions)

These tests use real API login credentials and run `full-workflow.spec.ts`.

| # | Scenario | Status |
|---|----------|--------|
| V1 | Admin can navigate to Configuration and see E2E Test Category | ✅ (skipped if no backend) |
| V2 | Admin can view E2E Reviewers group in `/roles` | ✅ (skipped if no backend) |
| V3 | Creator can navigate to article create page (DRAFT) | ✅ (skipped if no backend) |
| V4 | Creator sees their article in My Tasks | ✅ (skipped if no backend) |
| V5 | Reviewer sees submitted articles in My Tasks | ✅ (skipped if no backend) |
| V6 | Creator can navigate to course creation page | ✅ (skipped if no backend) |
| V7 | Admin can access course management page | ✅ (skipped if no backend) |
| V8 | Learner redirected from `/users` (real session) | ✅ (skipped if no backend) |
| V9 | Learner redirected from `/roles` (real session) | ✅ (skipped if no backend) |
| V10 | Reviewer can access `/my-tasks` (real session) | ✅ (skipped if no backend) |
| V11 | Admin can access all management routes (real session) | ✅ (skipped if no backend) |
| V12 | Public home page loads for unauthenticated user | ✅ |

---

## 11. Test Data Seeding (global-setup)

The E2E global setup (`e2e/global-setup.ts`) seeds the following before every run:

| Resource | Value | Purpose |
|----------|-------|---------|
| Creator user | `e2e-creator@geekgully.test` / `Creator@E2E2026!` | Tests content creation flows |
| Reviewer user | `e2e-reviewer@geekgully.test` / `Reviewer@E2E2026!` | Tests review flows |
| Learner user | `e2e-learner@geekgully.test` / `Learner@E2E2026!` | Tests learner access |
| Review group | `E2E Reviewers` (reviewer is member) | Tests review group assignment |
| Category | `E2E Test Category` (linked to E2E Reviewers) | Tests category + group workflow |

The teardown (`e2e/global-teardown.ts`) deletes all CMS items starting with `"E2E "` after each run.

---

## 12. Not Covered — Priority Backlog

### High Priority

| # | Missing Scenario | Suggested Spec |
|---|-----------------|----------------|
| X1 | Full article DRAFT → SUBMIT → REVIEWER CLAIMS → APPROVES → PUBLISH via UI | `full-workflow.spec.ts` |
| X2 | Full course DRAFT → SUBMIT → REVIEW → PUBLISHED via UI | `full-workflow.spec.ts` |
| X3 | Reviewer rejects article with comment → article goes to REJECTED | `full-workflow.spec.ts` |
| X4 | Admin assigns reviewer to a REVIEW-status article | `full-workflow.spec.ts` |

### Medium Priority

| # | Missing Scenario | Suggested Spec |
|---|-----------------|----------------|
| X5 | Bulk import page — CSV upload, validation, preview | New `bulk-import.spec.ts` |
| X6 | Article/course search by keyword | Extend `articles.spec.ts`, `courses.spec.ts` |
| X7 | Article/course filter by status (Draft, Published, etc.) | Extend `articles.spec.ts` |
| X8 | Notification bell — unread count, mark as read | New `notifications.spec.ts` |
| X9 | Profile page — view and edit own name/avatar | New `profile.spec.ts` |
| X10 | Account Settings page | New `account-settings.spec.ts` |
| X11 | Learning Path page loads and displays content | New `learning-path.spec.ts` |
| X12 | OAuth callback page (POST `/auth/callback?token=...`) | Extend `auth.spec.ts` |
| X13 | Multi-approval workflow (requiredApprovals > 1 category) | `full-workflow.spec.ts` |

### Low Priority

| # | Missing Scenario | Suggested Spec |
|---|-----------------|----------------|
| X14 | JWT expired in sessionStorage → auto-redirect to `/auth` | `auth.spec.ts` |
| X15 | Highlight creation from article/course content | `learner-journey.spec.ts` |
| X16 | Note creation and deletion | `learner-journey.spec.ts` |
| X17 | Enrolment button on public course page | `learner-journey.spec.ts` |
| X18 | My Learning shows enrolled course progress | `learner-journey.spec.ts` |
| X19 | Category tree reordering (drag-and-drop) | `configuration.spec.ts` |
| X20 | XSS: rich-text body with `<script>` tag is sanitized | New `security.spec.ts` |
| X21 | CORS: request from disallowed origin is rejected | Backend integration test |
| X22 | Social login buttons visible when feature flag is on | `auth.spec.ts` |
| X23 | Dark mode / theme toggle (if implemented) | New `ui-theme.spec.ts` |
| X24 | Responsive layout on mobile viewport | Extend any E2E spec |

---

## 13. How to Run All Tests

```powershell
# ── Backend unit tests ──────────────────────────────────────────────
cd gg-cms/backend/go-cms
go test ./internal/... -short -count=1

# ── Frontend unit tests ─────────────────────────────────────────────
cd gg-cms/frontend/react-ui
node node_modules/vitest/vitest.mjs run src/

# ── Frontend lint + types ───────────────────────────────────────────
npm run lint                                    # must exit 0
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json

# ── E2E tests (requires backend + Vite dev server) ──────────────────
# Start backend:  cd release/dist/native && .\server.exe
# Start frontend: cd gg-cms/frontend/react-ui && npm run dev

$env:PLAYWRIGHT_BASE_URL = "http://localhost:8080"
node node_modules/@playwright/test/cli.js test --config=playwright.local.config.ts

# ── Pre-commit gate (all-in-one) ─────────────────────────────────────
# Run /pre-commit in Claude Code
```

---

## 14. Test File Inventory

| File | Layer | Tests | Location |
|------|-------|-------|----------|
| `StatusBadge.test.tsx` | Unit | 9 | `src/components/shared/` |
| `WorkflowStatusBar.test.tsx` | Unit | 12 | `src/components/shared/` |
| `ReviewActionsPanel.test.tsx` | Unit | 24 | `src/components/shared/` |
| `ProtectedRoute.test.tsx` | Unit | 5 | `src/components/layout/` |
| `AppSidebar.test.tsx` | Unit | 18 | `src/components/layout/` |
| `Auth.test.tsx` | Unit | 10 | `src/pages/` |
| `Dashboard.test.tsx` | Unit | 8 | `src/pages/` |
| `Settings.test.tsx` | Unit | 4 | `src/pages/` |
| `NotFound.test.tsx` | Unit | 4 | `src/pages/` |
| `cms_handler_security_test.go` | Unit | 10 | `internal/interfaces/http/handler/` |
| `user_handler_security_test.go` | Unit | 5 | `internal/interfaces/http/handler/` |
| `service_security_test.go` | Unit | 12 | `internal/application/cms/` |
| `service_test.go` (settings) | Unit | 8 | `internal/application/settings/` |
| `local_test.go` | Unit | 6 | `internal/infrastructure/storage/` |
| `rate_limit_test.go` | Unit | 3 | `internal/interfaces/http/middleware/` |
| `auth.spec.ts` | E2E | 12 (1 skip) | `e2e/` |
| `dashboard.spec.ts` | E2E | 7 | `e2e/` |
| `articles.spec.ts` | E2E | 4 | `e2e/` |
| `courses.spec.ts` | E2E | 4 | `e2e/` |
| `configuration.spec.ts` | E2E | 5 | `e2e/` |
| `settings.spec.ts` | E2E | 9 | `e2e/` |
| `users.spec.ts` | E2E | 9 | `e2e/` |
| `content-workflow.spec.ts` | E2E | 7 | `e2e/` |
| `role-visibility.spec.ts` | E2E | 12 | `e2e/` |
| `security-authz.spec.ts` | E2E | 18 | `e2e/` |
| `reviewer-journey.spec.ts` | E2E | ~8 | `e2e/` |
| `reviewer-workflow-security.spec.ts` | E2E | ~6 | `e2e/` |
| `creator-journey.spec.ts` | E2E | ~8 | `e2e/` |
| `learner-journey.spec.ts` | E2E | ~10 | `e2e/` |
| `public.spec.ts` | E2E | 5 | `e2e/` |
| `full-workflow.spec.ts` | E2E | 12 (most skip) | `e2e/` |
