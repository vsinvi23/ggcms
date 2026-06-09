import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Article Management', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, true);
    await page.goto('/articles');
  });

  test('loads the articles page', async ({ page }) => {
    await expect(page).toHaveURL(/\/articles/);
  });

  test('does not redirect authenticated admin to /auth', async ({ page }) => {
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('renders an article list or empty state', async ({ page }) => {
    // Page should have loaded — check main content area is present
    await expect(page.locator('main, [role=main]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/articles/);
  });

  test('has a Create Article button', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: /new article|create article/i })
      .or(page.getByRole('link', { name: /new article|create article/i }));
    await expect(createBtn.first()).toBeVisible();
  });

  test('has search/filter controls', async ({ page }) => {
    const filterControls = page.locator('input[type=search], input[placeholder*="Search"], [role=searchbox]');
    await expect(filterControls.first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('Article Creator', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, true);
    await page.goto('/articles/create');
  });

  test('loads the article create page', async ({ page }) => {
    await expect(page).toHaveURL(/\/articles\/create/);
  });

  test('renders article title input', async ({ page }) => {
    const titleInput = page.getByLabel(/title/i)
      .or(page.locator('input[placeholder*="Title"]'))
      .or(page.locator('input[name="title"]'));
    await expect(titleInput.first()).toBeVisible({ timeout: 8_000 });
  });

  test('has a Save Draft button', async ({ page }) => {
    const saveDraft = page.getByRole('button', { name: /save draft|save as draft/i })
      .or(page.getByRole('button', { name: /save/i }));
    await expect(saveDraft.first()).toBeVisible({ timeout: 8_000 });
  });

  test('has a Back / Cancel navigation control', async ({ page }) => {
    const backControl = page.getByRole('link', { name: /back|cancel/i })
      .or(page.getByRole('button', { name: /back|cancel/i }));
    await expect(backControl.first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Article Management — unauthenticated', () => {
  test('redirects /articles to /auth', async ({ page }) => {
    await page.goto('/articles');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('redirects /articles/create to /auth', async ({ page }) => {
    await page.goto('/articles/create');
    await expect(page).toHaveURL(/\/auth/);
  });
});
