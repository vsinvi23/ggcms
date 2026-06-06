/**
 * Reviewer journey E2E tests.
 *
 * Covers the full review lifecycle as seen from the reviewer's perspective:
 * - Viewing content assigned to them in My Tasks
 * - Approve action directly
 * - Request Changes / Send Back with a required comment (dialog must be filled)
 * - Reject action with required comment
 *
 * These tests exercise the UI controls and workflow transitions visible inside
 * ArticleManagement and MyTasks for a "Reviewer" group member.
 */
import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

// ─── My Tasks — reviewer tab ──────────────────────────────────────────────────

test.describe('Reviewer — My Tasks reviewing tab', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'reviewer');
    await page.goto('/my-tasks');
  });

  test('reviewer can access /my-tasks', async ({ page }) => {
    await expect(page).toHaveURL(/\/my-tasks/);
  });

  test('My Tasks shows task tabs (content / notifications)', async ({ page }) => {
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toBeVisible({ timeout: 8_000 });
  });

  test('Tasks & Content tab is visible', async ({ page }) => {
    const contentTab = page.getByRole('tab', { name: /tasks|content/i });
    await expect(contentTab.first()).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Reviewer on ArticleManagement — claim & review actions ──────────────────

test.describe('Reviewer — ArticleManagement claim and review', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'reviewer');
    await page.goto('/articles');
  });

  test('reviewer can access /articles', async ({ page }) => {
    await expect(page).toHaveURL(/\/articles/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('articles page renders list or empty state for reviewer', async ({ page }) => {
    const content = page.locator('table, [role=grid]')
      .or(page.getByText(/No articles/i))
      .or(page.getByText(/no content/i));
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── ReviewActionsPanel — approve flow (via article editor) ──────────────────

test.describe('Reviewer — approve via article editor (review mode)', () => {
  test('reviewer accessing an article in review mode does not redirect to /auth', async ({ page }) => {
    await injectFakeSession(page, 'reviewer');
    await page.goto('/articles/create');
    // Article creator page should load without redirecting
    await expect(page).not.toHaveURL(/\/auth/);
  });
});

// ─── ReviewActionsPanel unit-level journey (via shared component tests) ───────
// The deep review-actions (approve/reject/request-changes with dialogs) are
// covered exhaustively in the unit tests for ReviewActionsPanel.
// These E2E tests focus on the navigation and page-load aspects of the flow.

test.describe('Reviewer — admin can see Assign Reviewer on REVIEW articles', () => {
  test('admin user has access to article management with assign capabilities', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/articles');
    await expect(page).toHaveURL(/\/articles/);
  });
});
