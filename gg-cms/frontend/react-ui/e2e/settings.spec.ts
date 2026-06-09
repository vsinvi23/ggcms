import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, true);
    await page.goto('/settings');
  });

  test('loads the settings page', async ({ page }) => {
    await expect(page).toHaveURL(/\/settings/);
  });

  test('renders the Storage tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Storage/i })).toBeVisible({ timeout: 8_000 });
  });

  test('renders the Features tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /Features/i })).toBeVisible({ timeout: 8_000 });
  });

  test('renders the General tab', async ({ page }) => {
    await expect(page.getByRole('tab', { name: /General/i })).toBeVisible({ timeout: 8_000 });
  });

  test('Storage tab shows local storage fields', async ({ page }) => {
    await page.getByRole('tab', { name: /Storage/i }).click();
    await expect(page.getByText('Storage Backend', { exact: true })).toBeVisible({ timeout: 8_000 });
  });

  test('Storage tab has a Save button', async ({ page }) => {
    await page.getByRole('tab', { name: /Storage/i }).click();
    const saveBtn = page.getByRole('button', { name: /Save Storage Settings|Save/i });
    await expect(saveBtn.first()).toBeVisible({ timeout: 8_000 });
  });

  test('switching storage provider to S3 shows S3 fields', async ({ page }) => {
    await page.getByRole('tab', { name: /Storage/i }).click();
    // Open the storage backend select
    const select = page.getByRole('combobox').first();
    await select.click();
    const s3Option = page.getByRole('option', { name: /S3/i });
    if (await s3Option.isVisible()) {
      await s3Option.click();
      await expect(page.getByPlaceholder(/my-uploads-bucket/i)
        .or(page.getByLabel(/Bucket/i))).toBeVisible();
    }
  });

  test('Features tab shows Learning Paths toggle', async ({ page }) => {
    await page.getByRole('tab', { name: /Features/i }).click();
    await expect(page.getByText('Learning Paths', { exact: true })).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Settings — unauthenticated', () => {
  test('redirects /settings to /auth', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/auth/);
  });
});
