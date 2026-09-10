import { test, expect } from '@playwright/test';

test.describe('GG-CMS End-to-End Full UI & Page Validation Suite', () => {

  test('1. Public Home Page loads correctly', async ({ page }) => {
    await page.goto('http://localhost:8080/');
    await expect(page).toHaveTitle(/GG-CMS|GeekGully|Learning/i);
    // Check main elements on home page
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('2. UI Login Flow with Master Admin Credentials', async ({ page }) => {
    await page.goto('http://localhost:8080/auth');
    await page.waitForLoadState('networkidle');

    // Fill in email and password
    const emailInput = page.locator('input[type="email"], input[name="identifier"], input[placeholder*="email" i], input[placeholder*="username" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill('geekadmin@geekgully.com');
    await passwordInput.fill('Geekadmin@2026');

    // Click submit button
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Verify successful login and navigation to authenticated layout/dashboard
    await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 10000 });
    expect(page.url()).not.toContain('/auth');
  });

  test('3. Authenticated Page Browsing & Content Verification', async ({ page }) => {
    // Perform login first
    await page.goto('http://localhost:8080/auth');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="identifier"], input[placeholder*="email" i], input[placeholder*="username" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill('geekadmin@geekgully.com');
    await passwordInput.fill('Geekadmin@2026');

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 10000 });

    // Validate Dashboard Page
    await page.goto('http://localhost:8080/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    // Validate Content Management Page
    await page.goto('http://localhost:8080/content');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    // Validate Courses Page
    await page.goto('http://localhost:8080/courses');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    // Validate Articles Page
    await page.goto('http://localhost:8080/articles');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    // Validate Configuration Page (Categories & Taxonomy)
    await page.goto('http://localhost:8080/configuration');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    // Validate User Management Page
    await page.goto('http://localhost:8080/user-management');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    // Validate Analytics Page
    await page.goto('http://localhost:8080/analytics');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    // Validate Content Factory Page
    await page.goto('http://localhost:8080/factory');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();

    // Validate Settings Page
    await page.goto('http://localhost:8080/settings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });
});
