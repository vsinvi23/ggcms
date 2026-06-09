/**
 * MEDIUM priority — My Learning and Learner Journey E2E tests
 */

import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('My Learning page', () => {
  test('loads /my-learning for authenticated user', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/my-learning');
    await expect(page).toHaveURL(/\/my-learning/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('my-learning renders main content', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/my-learning');
    await expect(page.locator('main, [role=main]').first()).toBeVisible({ timeout: 8_000 });
  });

  test('unauthenticated user redirected from /my-learning', async ({ page }) => {
    await page.goto('/my-learning');
    await expect(page).toHaveURL(/\/auth/, { timeout: 8_000 });
  });
});

test.describe('Notes & Highlights page', () => {
  test('loads /notes-highlights for authenticated user', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/notes-highlights');
    await expect(page).toHaveURL(/\/notes-highlights/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('notes page renders tabs', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/notes-highlights');
    const tab = page.getByRole('tab').first();
    await expect(tab).toBeVisible({ timeout: 8_000 });
  });

  test('unauthenticated user redirected from /notes-highlights', async ({ page }) => {
    await page.goto('/notes-highlights');
    await expect(page).toHaveURL(/\/auth/, { timeout: 8_000 });
  });
});

test.describe('Public content — learner view', () => {
  test('public home page loads for unauthenticated user', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/auth/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('authenticated learner can access /my-learning', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/my-learning');
    await expect(page).not.toHaveURL(/\/auth/);
  });
});
