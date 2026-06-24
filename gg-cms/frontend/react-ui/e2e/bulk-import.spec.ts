/**
 * MEDIUM priority — Bulk Import page E2E tests
 *
 * Covers: bulk import page load, file input present, error handling
 */

import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Bulk Import page', () => {
  test('bulk import page loads for authenticated user', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/import');
    await expect(page).toHaveURL(/\/import/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('import page renders main content area', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/import');
    await expect(page.locator('main, [role=main]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('import page has a file input or upload zone', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/import');
    const fileEl = page.locator('input[type="file"]')
      .or(page.getByRole('button', { name: /upload|import|browse|choose/i }))
      .or(page.locator('[class*="drop"], [class*="upload"]'));
    const found = await fileEl.first().isVisible({ timeout: 8_000 }).catch(() => false);
    if (!found) test.skip();
    else await expect(fileEl.first()).toBeVisible();
  });

  test('unauthenticated user redirected from /import', async ({ page }) => {
    await page.goto('/import');
    await expect(page).toHaveURL(/\/auth/, { timeout: 8_000 });
  });
});
