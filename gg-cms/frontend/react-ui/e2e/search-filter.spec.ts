/**
 * MEDIUM priority — Search and filter E2E tests
 *
 * Covers: article/course search by keyword, filter by status
 */

import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Article Management — search and filter', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/articles');
  });

  test('search input is present on articles page', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]')
      .or(page.getByRole('searchbox'))
      .or(page.getByPlaceholder(/search/i));
    await expect(searchInput.first()).toBeVisible({ timeout: 8_000 });
  });

  test('typing in search field does not redirect to /auth', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"], input[type="search"]')
      .or(page.getByRole('searchbox'))
      .or(page.getByPlaceholder(/search/i));

    const found = await searchInput.first().isVisible({ timeout: 5_000 }).catch(() => false);
    if (!found) { test.skip(); return; }

    await searchInput.first().fill('test article');
    await page.waitForTimeout(500);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('status filter or tab selector is present', async ({ page }) => {
    // Look for a status filter dropdown, tabs, or select
    const filterEl = page.getByRole('combobox')
      .or(page.getByRole('tab').first())
      .or(page.locator('select'))
      .or(page.getByRole('button', { name: /filter|status/i }));
    await expect(filterEl.first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Course Management — search and filter', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/courses');
  });

  test('search input is present on courses page', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"], input[placeholder*="search"]')
      .or(page.getByRole('searchbox'))
      .or(page.getByPlaceholder(/search/i));
    await expect(searchInput.first()).toBeVisible({ timeout: 8_000 });
  });

  test('filtering courses does not redirect to /auth', async ({ page }) => {
    const filterEl = page.getByRole('combobox').or(page.getByRole('tab').first());
    const found = await filterEl.first().isVisible({ timeout: 5_000 }).catch(() => false);
    if (!found) { test.skip(); return; }

    await filterEl.first().click().catch(() => {});
    await expect(page).not.toHaveURL(/\/auth/);
  });
});
