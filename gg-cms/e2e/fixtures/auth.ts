/**
 * Auth helpers for Playwright tests
 * Handles registration and login, stores session state
 */
import { Page } from '@playwright/test';
import axios from 'axios';

const API = process.env.API_BASE_URL || 'http://localhost:1337/api';
export const AUTH_BYPASS_HEADER = 'X-E2E-Bypass-Rate-Limit';
export const authBypassHeaders = { [AUTH_BYPASS_HEADER]: '1' };

interface EnsureUserOptions {
  email: string;
  password: string;
  username?: string;
  name?: string;
}

export interface EnsuredUser extends EnsureUserOptions {
  jwt?: string;
  user?: any;
}

const createdUsers = new Map<string, EnsuredUser>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function loginUser(email: string, password: string) {
  return axios.post(
    `${API}/auth/local`,
    { identifier: normalizeEmail(email), password },
    { headers: authBypassHeaders, validateStatus: () => true },
  );
}

async function registerUser({ email, password, username, name }: EnsureUserOptions) {
  return axios.post(
    `${API}/auth/local/register`,
    {
      username: username ?? normalizeEmail(email).split('@')[0],
      email: normalizeEmail(email),
      password,
      name: name ?? username ?? normalizeEmail(email).split('@')[0],
    },
    { headers: authBypassHeaders, validateStatus: () => true },
  );
}

export async function ensureUserExists(email: string, password: string, username?: string, name?: string) {
  const normalizedEmail = normalizeEmail(email);
  if (createdUsers.has(normalizedEmail)) {
    return createdUsers.get(normalizedEmail)!;
  }

  const loginResp = await loginUser(normalizedEmail, password);
  if (loginResp.status === 200 && loginResp.data?.jwt) {
    const ensured: EnsuredUser = {
      email: normalizedEmail,
      password,
      username,
      name,
      jwt: loginResp.data.jwt,
      user: loginResp.data.user,
    };
    createdUsers.set(normalizedEmail, ensured);
    return ensured;
  }

  const registerResp = await registerUser({ email: normalizedEmail, password, username, name });
  if (registerResp.status === 200 || registerResp.status === 201) {
    const ensured: EnsuredUser = {
      email: normalizedEmail,
      password,
      username,
      name,
      jwt: registerResp.data.jwt,
      user: registerResp.data.user,
    };
    createdUsers.set(normalizedEmail, ensured);
    return ensured;
  }

  if (registerResp.status === 400 || registerResp.status === 409) {
    const retryLogin = await loginUser(normalizedEmail, password);
    if (retryLogin.status === 200 && retryLogin.data?.jwt) {
      const ensured: EnsuredUser = {
        email: normalizedEmail,
        password,
        username,
        name,
        jwt: retryLogin.data.jwt,
        user: retryLogin.data.user,
      };
      createdUsers.set(normalizedEmail, ensured);
      return ensured;
    }
  }

  throw new Error(`Unable to ensure user exists for ${normalizedEmail}: ${registerResp.status} ${JSON.stringify(registerResp.data)}`);
}

export async function enableAuthBypass(page: Page) {
  await page.route('**/auth/local*', async (route) => {
    const headers = {
      ...route.request().headers(),
      [AUTH_BYPASS_HEADER]: '1',
    };
    await route.continue({ headers });
  });
}

export async function registerAndLogin(page: Page, email?: string, password?: string) {
  const ts = Date.now();
  const _email = email ?? `e2e_${ts}@test.local`;
  const _password = password ?? 'E2EPass@123';

  await ensureUserExists(_email, _password, `e2e_user_${ts}`, 'E2E Test User');

  await enableAuthBypass(page);
  await loginUI(page, _email, _password);
  return { email: _email, password: _password };
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
