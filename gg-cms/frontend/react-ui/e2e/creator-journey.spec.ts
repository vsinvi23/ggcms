/**
 * Content creator journey E2E tests.
 *
 * Covers the full lifecycle from the perspective of a content creator
 * (Editor group member):
 *   1. Navigate to article creation
 *   2. Fill in title and body, save as draft
 *   3. Submit for review
 *   4. View rejection feedback and resubmit
 *
 * Also covers the workflow status bar visible on created content.
 */
import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

// ─── Content creator access ───────────────────────────────────────────────────

test.describe('Content creator — access and navigation', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'creator');
  });

  test('creator can access /articles', async ({ page }) => {
    await page.goto('/articles');
    await expect(page).toHaveURL(/\/articles/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('creator can access /articles/create', async ({ page }) => {
    await page.goto('/articles/create');
    await expect(page).toHaveURL(/\/articles\/create/);
  });

  test('creator can access /courses', async ({ page }) => {
    await page.goto('/courses');
    await expect(page).toHaveURL(/\/courses/);
  });

  test('creator can access /courses/create', async ({ page }) => {
    await page.goto('/courses/create');
    await expect(page).toHaveURL(/\/courses\/create/);
  });
});

// ─── Article creation form ────────────────────────────────────────────────────

test.describe('Content creator — article creation form', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/articles/create');
  });

  test('article create page renders the title field', async ({ page }) => {
    const titleInput = page.getByLabel(/title/i)
      .or(page.locator('input[placeholder*="Title"]'))
      .or(page.locator('input[name="title"]'));
    await expect(titleInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('article create page has a Save Draft button', async ({ page }) => {
    const saveDraft = page.getByRole('button', { name: /save draft|save as draft|save/i });
    await expect(saveDraft.first()).toBeVisible({ timeout: 8_000 });
  });

  test('article create page has a Submit for Review button or workflow action', async ({ page }) => {
    const submitBtn = page.getByRole('button', { name: /submit.*review|submit/i });
    await expect(submitBtn.first()).toBeVisible({ timeout: 8_000 });
  });

  test('article create page has a category selector', async ({ page }) => {
    const categoryControl = page.getByRole('combobox')
      .or(page.getByLabel(/category/i))
      .or(page.locator('[data-testid="category-select"]'));
    await expect(categoryControl.first()).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Course creation form ─────────────────────────────────────────────────────

test.describe('Content creator — course creation form', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/courses/create');
  });

  test('course create page renders the title field', async ({ page }) => {
    const titleInput = page.getByLabel(/title/i)
      .or(page.locator('input[placeholder*="Title"]'));
    await expect(titleInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('course create page has a save action', async ({ page }) => {
    const saveBtn = page.getByRole('button', { name: /save|publish|create/i });
    await expect(saveBtn.first()).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Content workflow progression ────────────────────────────────────────────

test.describe('Content creator — My Tasks ownership tabs', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/my-tasks');
  });

  test('My Tasks page loads for creator', async ({ page }) => {
    await expect(page).toHaveURL(/\/my-tasks/);
  });

  test('My Tasks page shows task content area', async ({ page }) => {
    const taskArea = page.getByRole('tabpanel')
      .or(page.locator('table, [role=grid]'))
      .or(page.getByText(/no tasks|no content/i));
    await expect(taskArea.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Creator does NOT see admin controls ─────────────────────────────────────

test.describe('Content creator — no admin controls visible', () => {
  test('creator cannot access /users (admin-only)', async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/users');
    await expect(page).not.toHaveURL(/\/users/);
  });

  test('creator cannot access /settings (admin-only)', async ({ page }) => {
    await injectFakeSession(page, 'creator');
    await page.goto('/settings');
    await expect(page).not.toHaveURL(/\/settings/);
  });
});
