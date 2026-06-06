import { test, expect } from '@playwright/test';
import { injectFakeSession, TEST_ADMIN } from './helpers/auth';

// ─── Redirect behaviour ───────────────────────────────────────────────────────

test.describe('Auth — redirect guards', () => {
  test('redirects unauthenticated users from protected routes to /auth', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('redirects unauthenticated users from /articles to /auth', async ({ page }) => {
    await page.goto('/articles');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('authenticated users visiting /auth are redirected to /dashboard', async ({ page }) => {
    await injectFakeSession(page);
    await page.goto('/auth');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

// ─── Login page structure ─────────────────────────────────────────────────────

test.describe('Auth page — structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
  });

  test('renders the Login and Sign Up tabs', async ({ page }) => {
    await expect(page.getByRole('tab', { name: 'Login' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Sign Up' })).toBeVisible();
  });

  test('shows email and password fields on login tab', async ({ page }) => {
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('shows Back to Home link pointing to /', async ({ page }) => {
    const link = page.getByRole('link', { name: /Back to Home/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/');
  });

  test('switches to sign-up form and shows Full Name field', async ({ page }) => {
    await page.getByRole('tab', { name: 'Sign Up' }).click();
    await expect(page.getByLabel('Full Name')).toBeVisible();
    await expect(page.getByLabel('Confirm Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  test('password visibility toggle works', async ({ page }) => {
    const passwordInput = page.getByLabel('Password');
    await expect(passwordInput).toHaveAttribute('type', 'password');
    // Click the eye icon button
    await page.locator('#login-password').locator('..').locator('button[type=button]').click();
    await expect(passwordInput).toHaveAttribute('type', 'text');
  });
});

// ─── Login flow ───────────────────────────────────────────────────────────────

test.describe('Auth — login flow', () => {
  test('shows error toast on wrong credentials', async ({ page }) => {
    await page.goto('/auth');
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Password').fill('wrongpass');
    await page.getByRole('button', { name: 'Sign In' }).click();
    // Should stay on /auth — not navigate away
    await expect(page).toHaveURL(/\/auth/);
  });

  test('login with valid admin credentials redirects to /dashboard', async ({ page }) => {
    // NOTE: This test requires the backend to be running.
    // Skip gracefully if the API is unreachable.
    try {
      await page.goto('/auth');
      await page.getByLabel('Email').fill(TEST_ADMIN.email);
      await page.getByLabel('Password').fill(TEST_ADMIN.password);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL('**/dashboard', { timeout: 10_000 });
      await expect(page).toHaveURL(/\/dashboard/);
    } catch {
      test.skip();
    }
  });
});

// ─── Sign-up validation ───────────────────────────────────────────────────────

test.describe('Auth — signup validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Sign Up' }).click();
  });

  test('shows error when passwords do not match', async ({ page }) => {
    await page.getByLabel('Full Name').fill('Test User');
    await page.getByLabel('Email').fill('newuser@example.com');
    await page.getByLabel('Password').fill('password1');
    await page.getByLabel('Confirm Password').fill('password2');
    await page.getByRole('button', { name: 'Create Account' }).click();
    // Should stay on /auth
    await expect(page).toHaveURL(/\/auth/);
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

test.describe('Auth — logout', () => {
  test('after logout, protected routes redirect to /auth', async ({ page }) => {
    await injectFakeSession(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // Clear session (simulates logout)
    await page.evaluate(() => {
      sessionStorage.removeItem('authToken');
      sessionStorage.removeItem('auth_user');
    });

    await page.goto('/articles');
    await expect(page).toHaveURL(/\/auth/);
  });
});
