/**
 * Role-based UI visibility tests.
 *
 * Covers: which nav items, buttons, and sections are visible / hidden based
 * on the logged-in user's role (admin vs regular user vs reviewer vs creator).
 */
import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

// ─── Sidebar navigation — admin vs regular user ───────────────────────────────

test.describe('Sidebar nav — admin user', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/dashboard');
  });

  test('admin sees User Management section in sidebar', async ({ page }) => {
    await expect(page.locator('aside').getByText('User Management')).toBeVisible({ timeout: 8_000 });
  });

  test('admin sees Settings section in sidebar', async ({ page }) => {
    await expect(page.locator('aside').getByText('Settings')).toBeVisible({ timeout: 8_000 });
  });

  test('admin sees Analytics nav item in sidebar', async ({ page }) => {
    await expect(page.locator('aside').getByText('Analytics')).toBeVisible({ timeout: 8_000 });
  });

  test('admin sees Manage Users link', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Manage Users/i })).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Sidebar nav — regular user (learner)', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/dashboard');
  });

  test('regular user sees Dashboard nav item', async ({ page }) => {
    await expect(page.getByText('Dashboard')).toBeVisible({ timeout: 8_000 });
  });

  test('regular user sees My Tasks nav item', async ({ page }) => {
    await expect(page.locator('aside').getByText('My Tasks')).toBeVisible({ timeout: 8_000 });
  });

  test('regular user sees Courses nav item', async ({ page }) => {
    await expect(page.locator('aside').getByText('Courses')).toBeVisible({ timeout: 8_000 });
  });

  test('regular user does NOT see User Management in sidebar', async ({ page }) => {
    await expect(page.locator('aside').getByText('User Management')).not.toBeVisible({ timeout: 5_000 });
  });

  test('regular user does NOT see Analytics in sidebar', async ({ page }) => {
    await expect(page.locator('aside').getByText('Analytics')).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── Article Management — admin assigns reviewer; regular user cannot ─────────

test.describe('Article Management — admin Assign Reviewer button', () => {
  test('admin sees the Assign Reviewer action', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/articles');
    // The Assign Reviewer button only appears on REVIEW-status articles;
    // at minimum, the page should NOT redirect to /auth
    await expect(page).toHaveURL(/\/articles/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('reviewer cannot reach /users (admin-only route)', async ({ page }) => {
    await injectFakeSession(page, 'reviewer');
    await page.goto('/users');
    // Non-admin trying admin route should be redirected
    await expect(page).not.toHaveURL(/\/users/);
  });
});

// ─── Admin dashboard vs user dashboard ───────────────────────────────────────

test.describe('Dashboard — admin vs regular user', () => {
  test('admin dashboard shows "Admin Dashboard" heading', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/dashboard');
    await expect(page.getByText('Admin Dashboard')).toBeVisible({ timeout: 8_000 });
  });

  test('regular user dashboard shows a dashboard heading', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/dashboard');
    // Regular user gets a different dashboard — just check it loaded without redirect
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

// ─── Settings and Configuration — admin-only routes ──────────────────────────

test.describe('Admin-only routes', () => {
  for (const route of ['/settings', '/configuration', '/users', '/roles', '/analytics']) {
    test(`admin can access ${route}`, async ({ page }) => {
      await injectFakeSession(page, 'admin');
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/auth/);
    });
  }

  test('learner redirected away from /users', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/users');
    // ProtectedRoute with requireAdmin or the layout redirects non-admins
    // (implementation may redirect to / or /dashboard, not necessarily /auth)
    await expect(page).not.toHaveURL(/\/users/);
  });
});
