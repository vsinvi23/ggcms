import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Course Management', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, true);
    await page.goto('/courses');
  });

  test('loads the courses page', async ({ page }) => {
    await expect(page).toHaveURL(/\/courses/);
  });

  test('does not redirect authenticated admin to /auth', async ({ page }) => {
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('renders a course list or empty state', async ({ page }) => {
    await expect(page.locator('main, [role=main]').first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/courses/);
  });

  test('has a Create Course button', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: /new course|create course/i })
      .or(page.getByRole('link', { name: /new course|create course/i }));
    await expect(createBtn.first()).toBeVisible();
  });
});

test.describe('Course Creator', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, true);
    await page.goto('/courses/create');
  });

  test('loads the course create page', async ({ page }) => {
    await expect(page).toHaveURL(/\/courses\/create/);
  });

  test('renders a course title input', async ({ page }) => {
    const titleInput = page.getByLabel(/title/i)
      .or(page.locator('input[placeholder*="Title"]'))
      .or(page.locator('input[name="title"]'));
    await expect(titleInput.first()).toBeVisible({ timeout: 8_000 });
  });

  test('has a save or publish control', async ({ page }) => {
    const saveBtn = page.getByRole('button', { name: /save|publish|create/i });
    await expect(saveBtn.first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Course Management — unauthenticated', () => {
  test('redirects /courses to /auth', async ({ page }) => {
    await page.goto('/courses');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('redirects /courses/create to /auth', async ({ page }) => {
    await page.goto('/courses/create');
    await expect(page).toHaveURL(/\/auth/);
  });
});
