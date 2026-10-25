/**
 * Auth helpers for Playwright tests
 * Handles registration and login, stores session state
 */
import { APIRequestContext, Page, request } from '@playwright/test';
import { randomBytes } from 'crypto';

const API = process.env.API_BASE_URL || 'http://localhost:1337/api';

interface EnsureUserOptions {
  email: string;
  password: string;
  username?: string;
  name?: string;
}

export interface EnsuredUser extends EnsureUserOptions {
  user?: unknown;
}

const createdUsers = new Map<string, EnsuredUser>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export interface ApiSession {
  context: APIRequestContext;
  user?: { id?: number | string };
  csrfHeaders: () => Promise<Record<string, string>>;
}

export async function apiLogin(email: string, password: string): Promise<ApiSession | null> {
  const context = await request.newContext({ baseURL: `${API}/` });
  const resp = await context.post('auth/local', {
    data: { identifier: normalizeEmail(email), password },
  });
  if (resp.status() !== 200) {
    await context.dispose();
    return null;
  }
  const body = await resp.json();
  return {
    context,
    user: body.user,
    csrfHeaders: async () => {
      const { cookies } = await context.storageState();
      const csrf = cookies.find((c) => c.name === 'csrf_token')?.value ?? '';
      return { 'X-CSRF-Token': csrf };
    },
  };
}

async function registerUser({ email, password, username, name }: EnsureUserOptions) {
  const context = await request.newContext({ baseURL: `${API}/` });
  try {
    return await context.post('auth/local/register', {
      data: {
        username: username ?? normalizeEmail(email).split('@')[0],
        email: normalizeEmail(email),
        password,
        name: name ?? username ?? normalizeEmail(email).split('@')[0],
      },
    });
  } finally {
    await context.dispose();
  }
}

export async function ensureUserExists(email: string, password: string, username?: string, name?: string) {
  const normalizedEmail = normalizeEmail(email);
  if (createdUsers.has(normalizedEmail)) {
    return createdUsers.get(normalizedEmail)!;
  }

  const remember = async (session: ApiSession) => {
    const ensured: EnsuredUser = { email: normalizedEmail, password, username, name, user: session.user };
    await session.context.dispose();
    createdUsers.set(normalizedEmail, ensured);
    return ensured;
  };

  const existing = await apiLogin(normalizedEmail, password);
  if (existing) return remember(existing);

  // Registration returns 202 without a session, so sign in separately afterwards.
  const registerResp = await registerUser({ email: normalizedEmail, password, username, name });
  if (registerResp.status() === 202 || registerResp.status() === 200 || registerResp.status() === 201) {
    const session = await apiLogin(normalizedEmail, password);
    if (session) return remember(session);
  }

  throw new Error(`Unable to ensure user exists for ${normalizedEmail}: register returned ${registerResp.status()}`);
}

export async function registerAndLogin(page: Page, email?: string, password?: string) {
  const ts = Date.now();
  const _email = email ?? `e2e_${ts}@test.local`;
  const _password = password ?? process.env.E2E_USER_PASSWORD ?? `E2e!${randomBytes(12).toString('hex')}`;

  await ensureUserExists(_email, _password, `e2e_user_${ts}`, 'E2E Test User');

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
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set for admin e2e login');
  }
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
