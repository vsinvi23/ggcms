/**
 * Auth helpers for Playwright tests
 * Handles registration and login, stores session state
 */
import { Page, expect } from '@playwright/test';
import axios from 'axios';

const API = process.env.API_BASE_URL || 'http://localhost:1337/api';

export async function registerAndLogin(page: Page, email?: string, password?: string) {
  const ts = Date.now();
  const _email = email ?? `e2e_${ts}@test.local`;
  const _password = password ?? 'E2EPass@123';

  // Register via API directly (faster than UI)
  const reg = await axios.post(
    `${API}/auth/local/register`,
    {
      username: `e2e_user_${ts}`,
      email: _email,
      password: _password,
      name: 'E2E Test User',
    },
    { validateStatus: () => true },
  );

  if (reg.status !== 200) {
    throw new Error(`Registration failed: ${JSON.stringify(reg.data)}`);
  }

  // Now log in through the UI
  await loginUI(page, _email, _password);
  return { email: _email, password: _password, jwt: reg.data.jwt };
}

export async function loginUI(page: Page, email: string, password: string) {
  await page.goto('/auth');
  await page.waitForLoadState('networkidle');

  // Fill login form — selectors match shadcn/react-hook-form patterns
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submitBtn = page.locator('button[type="submit"]').first();
  await submitBtn.click();

  // Wait for redirect away from /auth
  await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
}

export async function loginAsAdmin(page: Page) {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@cms.local';
  const password = process.env.SEED_ADMIN_PASSWORD || 'Admin@CMS2024!';
  await loginUI(page, email, password);
}

export async function logout(page: Page) {
  // Try clicking a logout button if visible
  const logoutBtn = page.locator('[data-testid="logout"], button:has-text("Logout"), button:has-text("Sign out")').first();
  if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutBtn.click();
  } else {
    // Navigate directly to auth page
    await page.goto('/auth');
  }
  await page.waitForURL('**/auth**', { timeout: 10_000 }).catch(() => {});
}
