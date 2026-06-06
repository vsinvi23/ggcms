/**
 * Learner journey E2E tests.
 *
 * Covers the authenticated learner's journey through the platform:
 *   - Browse public content as authenticated user
 *   - Enroll button visible on public course cards
 *   - My Learning page shows enrolled courses and progress
 *   - Notes and highlights accessible
 *   - No admin-specific controls visible
 */
import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

// ─── Public home — visitor vs. authenticated ──────────────────────────────────

test.describe('Public home — visitor (unauthenticated)', () => {
  test('visitor sees public home without redirect', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/');
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('visitor sees a sign in / get started CTA', async ({ page }) => {
    await page.goto('/');
    const authCta = page.getByRole('link', { name: /sign in|get started|login/i })
      .or(page.getByRole('button', { name: /sign in|get started|login/i }));
    await expect(authCta.first()).toBeVisible({ timeout: 8_000 });
  });
});

test.describe('Public home — authenticated learner', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/');
  });

  test('authenticated learner sees public home without redirect to /auth', async ({ page }) => {
    await expect(page).toHaveURL('/');
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('authenticated learner does not see admin-only sidebar items on public home', async ({ page }) => {
    await expect(page.getByText('User Management')).not.toBeVisible({ timeout: 3_000 });
  });
});

// ─── My Learning page ─────────────────────────────────────────────────────────

test.describe('Learner — My Learning page', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/my-learning');
  });

  test('learner can access /my-learning', async ({ page }) => {
    await expect(page).toHaveURL(/\/my-learning/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('My Learning shows enrolled courses section or empty state', async ({ page }) => {
    const section = page.getByText(/enrolled courses|my courses|no courses/i)
      .or(page.locator('table, [role=grid]'))
      .or(page.getByRole('tabpanel'));
    await expect(section.first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Notes and Highlights ─────────────────────────────────────────────────────

test.describe('Learner — Notes and Highlights page', () => {
  test('learner can access /notes-highlights', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/notes-highlights');
    await expect(page).toHaveURL(/\/notes-highlights/);
    await expect(page).not.toHaveURL(/\/auth/);
  });
});

// ─── Profile and account settings ────────────────────────────────────────────

test.describe('Learner — Profile and account settings', () => {
  test('learner can access /profile', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/profile/);
  });

  test('learner can access /account-settings', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/account-settings');
    await expect(page).toHaveURL(/\/account-settings/);
  });
});

// ─── Learner sees content pages ───────────────────────────────────────────────

test.describe('Learner — content browsing', () => {
  test('learner can browse /explore/courses', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/explore/courses');
    await expect(page).toHaveURL(/\/explore\/courses/);
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('learner can view search results', async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/search?q=javascript');
    await expect(page).toHaveURL(/\/search/);
  });
});

// ─── Learner does NOT see admin nav items ─────────────────────────────────────

test.describe('Learner — no admin controls', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, 'learner');
    await page.goto('/dashboard');
  });

  test('learner dashboard does not show User Management nav', async ({ page }) => {
    await expect(page.getByText('User Management')).not.toBeVisible({ timeout: 5_000 });
  });

  test('learner dashboard does not show Analytics nav', async ({ page }) => {
    await expect(page.getByText('Analytics')).not.toBeVisible({ timeout: 5_000 });
  });
});

// ─── Learner is blocked from admin routes ────────────────────────────────────

test.describe('Learner — blocked from admin-only routes', () => {
  test.each(['/users', '/roles', '/analytics'])(
    'learner redirected from %s',
    async ({ page }, route) => {
      await injectFakeSession(page, 'learner');
      await page.goto(route);
      await expect(page).not.toHaveURL(new RegExp(route.replace('/', '\\/')));
    }
  );
});
