/**
 * MEDIUM priority — Profile and Account Settings E2E tests
 */

import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Profile page', () => {
  test('loads /profile for authenticated user', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('profile page renders main content', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/profile');
    await expect(page.locator('main, [role=main]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('unauthenticated user is redirected from /profile to /auth', async ({ page }) => {
    // No session injected — should redirect
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/auth/, { timeout: 8_000 });
  });
});

test.describe('Account Settings page', () => {
  test('loads /account-settings for authenticated user', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/account-settings');
    await expect(page).toHaveURL(/\/account-settings/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('account settings renders a form field', async ({ page }) => {
    await injectFakeSession(page, 'admin');
    await page.goto('/account-settings');
    const field = page.locator('input[type="text"], input[type="email"], input').first()
      .or(page.getByRole('textbox').first());
    await expect(field).toBeVisible({ timeout: 8_000 });
  });

  test('unauthenticated user is redirected from /account-settings', async ({ page }) => {
    await page.goto('/account-settings');
    await expect(page).toHaveURL(/\/auth/, { timeout: 8_000 });
  });
});
