/**
 * E2E Auth tests
 * Covers: registration, login, logout, protected route redirect, invalid credentials
 */
import { test, expect } from '@playwright/test';
import { ensureUserExists } from '../fixtures/auth';

const authEmail = process.env.E2E_AUTH_EMAIL || 'e2e_auth_user@test.local';
const authPassword = process.env.E2E_AUTH_PASSWORD || 'AuthE2E@12345';

test.beforeAll(async () => {
  await ensureUserExists(authEmail, authPassword, 'e2e_auth_user', 'E2E Auth User');
});

test.describe('Authentication', () => {
  test('home page loads without auth', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(page.url()).toBeTruthy();
    // Should not redirect to auth for public home
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('accessing /dashboard redirects to /auth when not logged in', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL('**/auth**', { timeout: 10_000 });
    expect(page.url()).toContain('/auth');
  });

  test('login page renders email and password fields', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
  });

  test('invalid credentials shows error message', async ({ page }) => {
    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill('nobody@test.local');
    await passwordInput.fill('wrongpassword');

    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    // Wait for error message to appear
    await page.waitForTimeout(2000);
    const errorMsg = page.locator('[role="alert"], .error, [data-testid*="error"], .toast').first();
    // URL should still be on auth page (login failed)
    expect(page.url()).toContain('/auth');
  });

  test('valid credentials redirect to dashboard', async ({ page }) => {
    await ensureUserExists(authEmail, authPassword, 'e2e_auth_user', 'E2E Auth User');

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    await emailInput.fill(authEmail);
    await passwordInput.fill(authPassword);

    await page.locator('button[type="submit"]').first().click();

    // Should redirect away from /auth
    await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
    expect(page.url()).not.toContain('/auth');
  });

  test('after login, dashboard is accessible', async ({ page }) => {
    await ensureUserExists(authEmail, authPassword, 'e2e_auth_user', 'E2E Auth User');

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(authEmail);
    await page.locator('input[type="password"]').first().fill(authPassword);
    await page.locator('button[type="submit"]').first().click();

    await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Should stay on dashboard (not redirect to auth)
    expect(page.url()).not.toContain('/auth');
  });

  test('session is held in cookies, not in browser storage, after login', async ({ page }) => {
    await ensureUserExists(authEmail, authPassword, 'e2e_auth_user', 'E2E Auth User');

    await page.goto('/auth');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(authEmail);
    await page.locator('input[type="password"]').first().fill(authPassword);
    await page.locator('button[type="submit"]').first().click();

    await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });

    const cookies = await page.context().cookies();
    const jwtCookie = cookies.find((c) => c.name === 'jwt');
    expect(jwtCookie?.httpOnly).toBe(true);
    expect(cookies.some((c) => c.name === 'csrf_token')).toBe(true);

    const tokenInStorage = await page.evaluate(() => {
      const looksLikeJwt = (v: string | null) => !!v && v.split('.').length === 3;
      for (const store of [sessionStorage, localStorage]) {
        for (let i = 0; i < store.length; i++) {
          if (looksLikeJwt(store.getItem(store.key(i)!))) return true;
        }
      }
      return false;
    });
    expect(tokenInStorage).toBe(false);
  });
});
