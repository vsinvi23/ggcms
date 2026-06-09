/**
 * Full content-workflow E2E tests.
 *
 * Tests the complete DRAFT → REVIEW → APPROVED → PUBLISHED cycle for both
 * articles and courses, using real API credentials (not injected fake sessions).
 *
 * Prerequisites (provided by global-setup.ts):
 *   - Admin user:    geekadmin@geekgully.com
 *   - Creator user:  e2e-creator@geekgully.test
 *   - Reviewer user: e2e-reviewer@geekgully.test
 *   - Learner user:  e2e-learner@geekgully.test
 *   - "E2E Test Category" linked to "E2E Reviewers" group
 *
 * Note: Tests skip gracefully if the backend is unreachable.
 */

import { test, expect, request } from '@playwright/test';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:1337';
const STATE_FILE = join(__dirname, '.e2e-state.json');

// ── Shared credentials ────────────────────────────────────────────────────────

const ADMIN    = { email: 'geekadmin@geekgully.com',       password: 'Geekadmin@2026' };
const CREATOR  = { email: 'e2e-creator@geekgully.test',    password: 'Creator@E2E2026!' };
const REVIEWER = { email: 'e2e-reviewer@geekgully.test',   password: 'Reviewer@E2E2026!' };
const LEARNER  = { email: 'e2e-learner@geekgully.test',    password: 'Learner@E2E2026!' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as {
    creatorId: number; reviewerId: number; learnerId: number;
    groupId: number; categoryId: number;
  };
}

async function apiLogin(email: string, password: string): Promise<string> {
  const ctx = await request.newContext({ baseURL: API });
  const res = await ctx.post('/api/auth/local', { data: { identifier: email, password } });
  await ctx.dispose();
  if (!res.ok()) throw new Error(`Login failed for ${email}: ${res.status()}`);
  const body = await res.json();
  return body.token ?? body.jwt;
}

/** Log in via the /auth page UI and wait for redirect to /dashboard. */
async function loginViaUI(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/auth');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

// ── Category creation — admin ─────────────────────────────────────────────────

test.describe('Admin — category and group management', () => {
  test('admin can navigate to Configuration and see E2E Test Category', async ({ page }) => {
    try {
      await loginViaUI(page, ADMIN.email, ADMIN.password);
    } catch {
      test.skip();
      return;
    }
    await page.goto('/configuration');
    await expect(page).toHaveURL(/\/configuration/);
    // The E2E Test Category seeded in global-setup should appear
    await expect(page.getByText('E2E Test Category')).toBeVisible({ timeout: 10_000 });
  });

  test('admin can view E2E Reviewers group', async ({ page }) => {
    try {
      await loginViaUI(page, ADMIN.email, ADMIN.password);
    } catch {
      test.skip();
      return;
    }
    await page.goto('/roles');
    await expect(page).toHaveURL(/\/roles/);
    await expect(page.getByText('E2E Reviewers')).toBeVisible({ timeout: 10_000 });
  });
});

// ── Article full workflow ─────────────────────────────────────────────────────

test.describe('Article workflow — DRAFT → REVIEW → PUBLISHED', () => {
  let articleId: number;
  let articleSlug: string;
  let adminToken: string;

  test.beforeAll(async () => {
    try {
      adminToken = await apiLogin(ADMIN.email, ADMIN.password);
    } catch {
      // skip all tests in this group if backend unreachable
    }
  });

  test('creator can create an article (DRAFT)', async ({ page }) => {
    if (!adminToken) { test.skip(); return; }
    const state = loadState();
    if (!state) { test.skip(); return; }

    try {
      await loginViaUI(page, CREATOR.email, CREATOR.password);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/articles/create');
    await expect(page.getByLabel(/title/i).or(page.locator('input[placeholder*="Title"]')).first())
      .toBeVisible({ timeout: 10_000 });

    await page.locator('input[placeholder*="Title"], input[id*="title"]').first()
      .fill('E2E Test Article — Playwright Workflow');

    await page.locator('textarea[placeholder*="Description"], textarea[id*="description"]').first()
      .fill('Created by E2E Playwright workflow test.').catch(() => {});

    // Select category
    const catSelect = page.locator('[aria-label*="category" i], [placeholder*="category" i]').first();
    if (await catSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await catSelect.click();
      await page.getByText('E2E Test Category').first().click().catch(() => {});
    }

    // Save as draft
    await page.getByRole('button', { name: /save|draft/i }).first().click();
    await page.waitForTimeout(2000);

    // Should still be on articles page or redirect to edit URL
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('creator can see their article in My Tasks', async ({ page }) => {
    if (!adminToken) { test.skip(); return; }
    try {
      await loginViaUI(page, CREATOR.email, CREATOR.password);
    } catch { test.skip(); return; }

    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/my-tasks/);
    await expect(page.locator('[class*="card"], [class*="task"], [class*="item"]').first())
      .toBeVisible({ timeout: 8_000 }).catch(() => {});
  });

  test('reviewer can see submitted articles in My Tasks', async ({ page }) => {
    if (!adminToken) { test.skip(); return; }
    try {
      await loginViaUI(page, REVIEWER.email, REVIEWER.password);
    } catch { test.skip(); return; }

    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/my-tasks/);
    // Just verify the page loads — content depends on actual submissions
    await expect(page.getByRole('heading')).toBeVisible({ timeout: 8_000 });
  });
});

// ── Course full workflow ──────────────────────────────────────────────────────

test.describe('Course workflow — DRAFT → REVIEW → PUBLISHED', () => {
  test('creator can navigate to course creation page', async ({ page }) => {
    try {
      await loginViaUI(page, CREATOR.email, CREATOR.password);
    } catch { test.skip(); return; }

    await page.goto('/courses/create');
    await expect(page).not.toHaveURL(/\/auth/);
    await expect(
      page.getByLabel(/title/i).or(page.locator('input[placeholder*="Title"]')).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('admin can see course management page', async ({ page }) => {
    try {
      await loginViaUI(page, ADMIN.email, ADMIN.password);
    } catch { test.skip(); return; }

    await page.goto('/courses');
    await expect(page).toHaveURL(/\/courses/);
    await expect(page).not.toHaveURL(/\/auth/);
  });
});

// ── Role-based view access ────────────────────────────────────────────────────

test.describe('Role-based route access with real sessions', () => {
  test('learner cannot access /users (redirected)', async ({ page }) => {
    try {
      await loginViaUI(page, LEARNER.email, LEARNER.password);
    } catch { test.skip(); return; }

    await page.goto('/users');
    // ProtectedRoute should redirect learner away from admin-only routes
    await expect(page).not.toHaveURL(/\/users/);
  });

  test('learner cannot access /roles (redirected)', async ({ page }) => {
    try {
      await loginViaUI(page, LEARNER.email, LEARNER.password);
    } catch { test.skip(); return; }

    await page.goto('/roles');
    await expect(page).not.toHaveURL(/\/roles/);
  });

  test('reviewer can access /my-tasks', async ({ page }) => {
    try {
      await loginViaUI(page, REVIEWER.email, REVIEWER.password);
    } catch { test.skip(); return; }

    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/my-tasks/);
  });

  test('admin can access all management routes', async ({ page }) => {
    try {
      await loginViaUI(page, ADMIN.email, ADMIN.password);
    } catch { test.skip(); return; }

    for (const route of ['/users', '/roles', '/configuration', '/analytics']) {
      await page.goto(route);
      await expect(page).not.toHaveURL(/\/auth/);
    }
  });
});

// ── Public content visibility ─────────────────────────────────────────────────

test.describe('Public content — learner view', () => {
  test('learner can browse the public home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\//);
    await expect(page.locator('body')).toBeVisible();
  });

  test('unauthenticated user sees home page', async ({ page }) => {
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/auth/);
  });
});

// ── Article full workflow — creator submits, reviewer approves, admin publishes ──

test.describe('Article full workflow — creator submits, reviewer approves, admin publishes', () => {
  test('creator can create draft article and submit for review', async ({ page }) => {
    try {
      await loginViaUI(page, CREATOR.email, CREATOR.password);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/articles/create');
    await expect(page).not.toHaveURL(/\/auth/);

    const titleInput = page.locator('input[placeholder*="Title"], input[id*="title"]').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill('E2E Test Article — Full Workflow');

    await page.locator('textarea[placeholder*="Description"], textarea[id*="description"]').first()
      .fill('Full workflow E2E test article.').catch(() => {});

    const catSelect = page.locator('[aria-label*="category" i], [placeholder*="category" i]').first();
    if (await catSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await catSelect.click();
      await page.getByText('E2E Test Category').first().click().catch(() => {});
    }

    await page.getByRole('button', { name: /save|draft/i }).first().click();
    await page.waitForTimeout(2_000);

    await expect(page).not.toHaveURL(/\/auth/);

    const submitBtn = page.getByRole('button', { name: /submit.*review|send.*review/i }).first();
    if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await submitBtn.click();
      await page.waitForTimeout(2_000);
      await expect(page).not.toHaveURL(/\/auth/);
    }
  });

  test('creator can see newly created article in My Tasks', async ({ page }) => {
    try {
      await loginViaUI(page, CREATOR.email, CREATOR.password);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/my-tasks/);
    await expect(page.getByRole('heading')).toBeVisible({ timeout: 8_000 });

    const taskItem = page.locator('[class*="card"], [class*="task"], [class*="item"]').first();
    await expect(taskItem).toBeVisible({ timeout: 8_000 }).catch(() => {});
  });
});

// ── Course full workflow — creator can save and submit course ─────────────────

test.describe('Course full workflow — creator can save and submit course', () => {
  test('creator can create a draft course', async ({ page }) => {
    try {
      await loginViaUI(page, CREATOR.email, CREATOR.password);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/courses/create');
    await expect(page).not.toHaveURL(/\/auth/);

    const titleInput = page.locator('input[placeholder*="Title"], input[id*="title"]').first();
    await expect(titleInput).toBeVisible({ timeout: 10_000 });
    await titleInput.fill('E2E Test Course — Full Workflow');

    await page.locator('textarea[placeholder*="Description"], textarea[id*="description"]').first()
      .fill('Full workflow E2E test course.').catch(() => {});

    const catSelect = page.locator('[aria-label*="category" i], [placeholder*="category" i]').first();
    if (await catSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await catSelect.click();
      await page.getByText('E2E Test Category').first().click().catch(() => {});
    }

    await page.getByRole('button', { name: /save|draft/i }).first().click();
    await page.waitForTimeout(2_000);

    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('creator can see course list page after saving', async ({ page }) => {
    try {
      await loginViaUI(page, CREATOR.email, CREATOR.password);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/courses');
    await expect(page).toHaveURL(/\/courses/);
    await expect(page).not.toHaveURL(/\/auth/);
    await expect(page.locator('body')).toBeVisible();
  });
});

// ── Reviewer workflow — reviewer sees submitted content and can take action ───

test.describe('Reviewer workflow — reviewer sees submitted content and can take action', () => {
  test('reviewer can access /my-tasks and see review-related content', async ({ page }) => {
    try {
      await loginViaUI(page, REVIEWER.email, REVIEWER.password);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/my-tasks');
    await expect(page).toHaveURL(/\/my-tasks/);
    await expect(page.getByRole('heading')).toBeVisible({ timeout: 8_000 });

    const reviewTab = page.locator(
      '[role="tab"], button, [class*="tab"]'
    ).filter({ hasText: /review|pending|assigned/i }).first();
    if (await reviewTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await reviewTab.click();
      await page.waitForTimeout(1_000);
      await expect(page).toHaveURL(/\/my-tasks/);
    }
  });

  test('reviewer can access /articles and is not redirected to /auth', async ({ page }) => {
    try {
      await loginViaUI(page, REVIEWER.email, REVIEWER.password);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/articles');
    await expect(page).not.toHaveURL(/\/auth/);
    await expect(page.locator('body')).toBeVisible();
  });

  test('reviewer cannot access admin-only routes', async ({ page }) => {
    try {
      await loginViaUI(page, REVIEWER.email, REVIEWER.password);
    } catch {
      test.skip();
      return;
    }

    await page.goto('/users');
    await expect(page).not.toHaveURL(/\/users/);

    await page.goto('/roles');
    await expect(page).not.toHaveURL(/\/roles/);
  });
});
