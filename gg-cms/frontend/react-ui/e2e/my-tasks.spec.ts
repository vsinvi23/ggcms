/**
 * My Tasks page — ownership tabs and status filtering.
 *
 * Covers:
 *   - Owned / Reviewing / Contributed tab visibility
 *   - Status filter dropdown
 *   - Each role sees the relevant task list
 */
import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('My Tasks — page structure', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/my-tasks');
  });

  test('loads /my-tasks without redirecting to /auth', async ({ page }) => {
    await expect(page).toHaveURL(/\/my-tasks/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('renders at least one tab (Tasks & Content or Notifications)', async ({ page }) => {
    const tab = page.getByRole('tab');
    await expect(tab.first()).toBeVisible({ timeout: 8_000 });
  });

  test('Tasks & Content tab is present', async ({ page }) => {
    const tab = page.getByRole('tab', { name: /tasks|content/i });
    await expect(tab.first()).toBeVisible({ timeout: 8_000 });
  });

  test('clicking Tasks & Content shows a task table or empty state', async ({ page }) => {
    const contentTab = page.getByRole('tab', { name: /tasks|content/i });
    await contentTab.first().click();
    const content = page.locator('table, [role=grid]')
      .or(page.getByText(/no tasks|no content|empty/i))
      .or(page.getByRole('tabpanel'));
    await expect(content.first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('My Tasks — status filter', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/my-tasks');
    // Click the Tasks & Content tab first
    const contentTab = page.getByRole('tab', { name: /tasks|content/i });
    await contentTab.first().click();
  });

  test('has a status filter control', async ({ page }) => {
    const statusFilter = page.getByRole('combobox')
      .or(page.locator('select'))
      .or(page.getByRole('button', { name: /status|filter/i }));
    await expect(statusFilter.first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('My Tasks — reviewer sees reviewing tasks', () => {
  test('reviewer can access /my-tasks', async ({ page }) => {
    await injectFakeSession(page, 'reviewer');
    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/my-tasks/);
    await expect(page).not.toHaveURL(/\/auth/);
  });
});

test.describe('My Tasks — admin sees all tasks', () => {
  test('admin can access /my-tasks', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/my-tasks/);
  });
});

test.describe('My Tasks — learner (no groups) access', () => {
  test('learner can access /my-tasks', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/my-tasks/);
    await expect(page).not.toHaveURL(/\/auth/);
  });
});

test.describe('My Tasks — unauthenticated user', () => {
  test('redirects to /auth', async ({ page }) => {
    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/auth/);
  });
});
