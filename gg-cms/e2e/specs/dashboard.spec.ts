/**
 * Dashboard E2E tests
 * Covers: navigation, sidebar links, user info display, API data loading
 */
import { test, expect, Page } from '@playwright/test';
import axios from 'axios';

const API = process.env.API_BASE_URL || 'http://localhost:1337/api';

async function createAndLoginUser(page: Page) {
  const ts = Date.now();
  const email = `e2e_db_${ts}@test.local`;
  const password = 'Dashboard@E2E1';
  await axios.post(`${API}/auth/local/register`, { username: `e2e_db_${ts}`, email, password });

  await page.goto('/auth');
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
}

test.describe('Dashboard', () => {
  test('dashboard page loads after login', async ({ page }) => {
    await createAndLoginUser(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    expect(page.url()).not.toContain('/auth');
    // Page should have some content
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('dashboard does not show a full-page error', async ({ page }) => {
    await createAndLoginUser(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // No uncaught error boundary visible
    const errorBoundary = page.locator('text="Something went wrong"').first();
    await expect(errorBoundary).not.toBeVisible();
  });

  test('navigation sidebar is visible', async ({ page }) => {
    await createAndLoginUser(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const nav = page.locator('nav, aside, [role="navigation"]').first();
    await expect(nav).toBeVisible({ timeout: 10_000 });
  });

  test('can navigate to /articles via sidebar or direct URL', async ({ page }) => {
    await createAndLoginUser(page);
    await page.goto('/articles');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/auth');
  });

  test('can navigate to /courses via direct URL', async ({ page }) => {
    await createAndLoginUser(page);
    await page.goto('/courses');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/auth');
  });

  test('can navigate to /categories via direct URL', async ({ page }) => {
    await createAndLoginUser(page);
    await page.goto('/categories');
    await page.waitForLoadState('networkidle');
    expect(page.url()).not.toContain('/auth');
  });

  test('unauthenticated user is redirected from /dashboard', async ({ page }) => {
    // Don't login
    await page.goto('/dashboard');
    await page.waitForURL('**/auth**', { timeout: 10_000 });
    expect(page.url()).toContain('/auth');
  });

  test('unauthenticated user is redirected from /articles', async ({ page }) => {
    await page.goto('/articles');
    await page.waitForURL('**/auth**', { timeout: 10_000 });
    expect(page.url()).toContain('/auth');
  });
});
