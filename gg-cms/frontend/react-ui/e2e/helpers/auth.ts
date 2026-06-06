import { Page } from '@playwright/test';

export const TEST_ADMIN = {
  email: 'geekadmin@geekgully.com',
  password: 'Geekadmin@2026',
  name: 'Geek Admin',
};

export const TEST_USER = {
  email: 'testuser@geekgully.com',
  password: 'TestUser@2026',
  name: 'Test User',
};

/**
 * Logs in via the /auth page UI and waits for redirect to /dashboard.
 * Reuses the page object directly — call after page.goto('/auth').
 */
export async function loginAs(page: Page, credentials = TEST_ADMIN) {
  await page.goto('/auth');
  await page.getByLabel('Email').fill(credentials.email);
  await page.getByLabel('Password').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

export type SessionRole = 'admin' | 'reviewer' | 'creator' | 'learner';

interface SessionOptions {
  role?: SessionRole;
  userId?: number;
  groups?: { id: number; name: string }[];
}

/**
 * Injects a fake auth token + user data directly into sessionStorage so tests
 * can bypass the login UI for non-auth-related test cases.
 *
 * role presets:
 *   'admin'    → isAdmin=true, group=[Admin]
 *   'reviewer' → isAdmin=false, group=[Reviewer]
 *   'creator'  → isAdmin=false, group=[Editor]
 *   'learner'  → isAdmin=false, group=[]   (authenticated, no special groups)
 *
 * Pass `groups` to override the group list entirely.
 */
export async function injectFakeSession(
  page: Page,
  isAdminOrRole: boolean | SessionRole = true,
  opts: SessionOptions = {}
) {
  const role: SessionRole =
    typeof isAdminOrRole === 'string'
      ? isAdminOrRole
      : isAdminOrRole
      ? 'admin'
      : 'learner';

  const groupsByRole: Record<SessionRole, { id: number; name: string }[]> = {
    admin:    [{ id: 1, name: 'Admin' }],
    reviewer: [{ id: 2, name: 'Reviewer' }],
    creator:  [{ id: 3, name: 'Editor' }],
    learner:  [],
  };

  const groups = opts.groups ?? groupsByRole[role];
  const isAdmin = role === 'admin';

  await page.addInitScript(
    ({ isAdmin, role, groups, userId }) => {
      const fakeUser = {
        id: userId,
        email: isAdmin ? 'geekadmin@geekgully.com' : `test-${role}@geekgully.com`,
        name: isAdmin ? 'Geek Admin' : `Test ${role.charAt(0).toUpperCase() + role.slice(1)}`,
        status: 'ACTIVE',
        role: isAdmin ? 'admin' : 'user',
      };
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({
        sub: String(userId),
        email: fakeUser.email,
        userId,
        role: fakeUser.role,
        exp: Math.floor(Date.now() / 1000) + 86400,
      }));
      const fakeToken = `${header}.${payload}.fake_signature`;
      sessionStorage.setItem('authToken', fakeToken);
      sessionStorage.setItem('auth_user', JSON.stringify(fakeUser));
      sessionStorage.setItem('user_groups_cache', JSON.stringify(groups));
    },
    { isAdmin, role, groups, userId: opts.userId ?? (isAdmin ? 1 : 99) }
  );
}
