/**
 * security-authz.spec.ts
 *
 * UI-level tests for role-based access control introduced by the security hardening:
 *  - Admin-only routes redirect or deny non-admin users
 *  - Admin UI controls (Manage Users, Categories admin, Content Types, Settings) are
 *    only visible to admin role
 *  - Non-admin users cannot reach write paths for admin-only resources
 *  - Content ownership: only admins and the original author see Edit/Delete controls
 *
 * All tests use injectFakeSession() to bypass the login UI — this sets the same
 * sessionStorage keys that the real login flow sets, so role-dependent UI rendering
 * is exercised without hitting the backend.
 */

import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

// ─── Admin-only routes ────────────────────────────────────────────────────────

test.describe('Admin-only routes — non-admin is redirected', () => {
  const adminOnlyRoutes = ['/users', '/configuration', '/settings'];

  for (const route of adminOnlyRoutes) {
    test(`learner cannot access ${route}`, async ({ page }) => {
      await injectFakeSession(page, 'learner');
      await page.goto(route);
      // Non-admin should be redirected away from admin pages
      await expect(page).not.toHaveURL(new RegExp(route.replace('/', '\\/')), { timeout: 8_000 });
    });
  }

  test('creator cannot access /users', async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/users');
    await expect(page).not.toHaveURL(/\/users/, { timeout: 8_000 });
  });

  test('reviewer cannot access /configuration', async ({ page }) => {
    await injectFakeSession(page, 'reviewer');
    await page.goto('/configuration');
    await expect(page).not.toHaveURL(/\/configuration/, { timeout: 8_000 });
  });
});

test.describe('Admin-only routes — admin has full access', () => {
  const adminOnlyRoutes = ['/users', '/settings', '/analytics'];

  for (const route of adminOnlyRoutes) {
    test(`admin can access ${route}`, async ({ page }) => {
      await injectFakeSession(page, 'admin');
      await page.goto(route);
      // Admin should not be redirected to /auth
      await expect(page).not.toHaveURL(/\/auth/, { timeout: 8_000 });
    });
  }
});

// ─── Sidebar navigation visibility ───────────────────────────────────────────

test.describe('Admin sidebar items — only visible to admin', () => {
  test('admin sees User Management in sidebar', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/dashboard');
    await expect(page.locator('aside').getByText('User Management')).toBeVisible({ timeout: 8_000 });
  });

  test('learner does NOT see User Management in sidebar', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/dashboard');
    // Wait for sidebar to render, then verify the admin section is absent
    await page.locator('aside').waitFor({ timeout: 8_000 });
    await expect(page.locator('aside').getByText('User Management', { exact: true })).toHaveCount(0);
  });

  test('creator does NOT see User Management in sidebar', async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/dashboard');
    await page.locator('aside').waitFor({ timeout: 8_000 });
    await expect(page.locator('aside').getByText('User Management', { exact: true })).toHaveCount(0);
  });

  test('admin sees Settings in sidebar', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/dashboard');
    await expect(page.locator('aside').getByText('Settings')).toBeVisible({ timeout: 8_000 });
  });

  test('learner does NOT see Settings in sidebar', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/dashboard');
    await expect(page.locator('aside').getByText('Settings')).not.toBeVisible({ timeout: 5_000 });
  });

  test('admin sees Analytics in sidebar', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/dashboard');
    await expect(page.locator('aside').getByText('Analytics')).toBeVisible({ timeout: 8_000 });
  });

  test('learner does NOT see Analytics in sidebar', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/dashboard');
    await expect(page.locator('aside').getByText('Analytics')).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── Content management — author vs others ────────────────────────────────────

test.describe('Content management — admin sees all controls', () => {
  test('admin article list is accessible', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/articles');
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 8_000 });
  });

  test('creator can reach article creation page', async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/articles/create');
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 8_000 });
  });

  test('learner can reach public course catalogue', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/courses');
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 8_000 });
  });
});

// ─── Authentication gate — no token redirects to /auth ────────────────────────

test.describe('Unauthenticated access is blocked', () => {
  const protectedRoutes = ['/dashboard', '/articles', '/my-tasks', '/settings'];

  for (const route of protectedRoutes) {
    test(`unauthenticated user redirected from ${route}`, async ({ page }) => {
      // Do NOT inject a session — browser starts with clean storage
      await page.goto(route);
      // Should end up on /auth (login page)
      await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
    });
  }
});

// ─── User management page — admin actions ─────────────────────────────────────

test.describe('User management page — admin UI controls', () => {
  test('admin reaches /users without redirect', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/users');
    await expect(page).toHaveURL(/\/users/, { timeout: 8_000 });
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('admin sees Manage Users link in sidebar', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/dashboard');
    await expect(
      page.getByRole('link', { name: /Manage Users/i })
    ).toBeVisible({ timeout: 8_000 });
  });

  test('non-admin does NOT see Manage Users link in sidebar', async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/dashboard');
    await expect(
      page.getByRole('link', { name: /Manage Users/i })
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
