import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Configuration page', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, true);
    await page.goto('/configuration');
  });

  test('loads the configuration page', async ({ page }) => {
    await expect(page).toHaveURL(/\/configuration/);
  });

  test('/categories redirects to /configuration', async ({ page }) => {
    await page.goto('/categories');
    await expect(page).toHaveURL(/\/configuration/);
  });

  test('renders the Categories tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Categories/i })).toBeVisible({ timeout: 8_000 });
  });

  test('renders the Tags tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Tags/i })).toBeVisible({ timeout: 8_000 });
  });

  test('renders the Content Types tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Content Types/i })).toBeVisible({ timeout: 8_000 });
  });

  test('Categories tab shows category tree or empty state', async ({ page }) => {
    const categoriesTab = page.getByRole('tab', { name: /Categories/i });
    await categoriesTab.click();
    const content = page.getByRole('tabpanel')
      .or(page.getByText(/No categories/i))
      .or(page.locator('[data-testid="category-tree"]'));
    await expect(content.first()).toBeVisible({ timeout: 8_000 });
  });

  test('Tags tab shows tag list or empty state', async ({ page }) => {
    const tagsTab = page.getByRole('tab', { name: /Tags/i });
    await tagsTab.click();
    const content = page.getByRole('tabpanel')
      .or(page.getByText(/No tags/i));
    await expect(content.first()).toBeVisible({ timeout: 8_000 });
  });

  test('has a button to create a new category', async ({ page }) => {
    await page.getByRole('tab', { name: /Categories/i }).click();
    const createBtn = page.getByRole('button', { name: /add category|new category|create/i });
    await expect(createBtn.first()).toBeVisible({ timeout: 8_000 });
  });

  test('has a button to create a new tag', async ({ page }) => {
    await page.getByRole('tab', { name: /Tags/i }).click();
    const createBtn = page.getByRole('button', { name: /add tag|new tag|create/i });
    await expect(createBtn.first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Configuration — unauthenticated', () => {
  test('redirects /configuration to /auth', async ({ page }) => {
    await page.goto('/configuration');
    await expect(page).toHaveURL(/\/auth/);
  });
});
