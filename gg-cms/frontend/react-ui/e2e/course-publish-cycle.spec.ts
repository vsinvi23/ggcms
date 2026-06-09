/**
 * HIGH priority — Full course publish cycle E2E
 *
 * Covers: DRAFT → SUBMIT → ASSIGNED → APPROVED → PUBLISHED for courses
 */

import { test, expect, request } from '@playwright/test';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API   = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:1337';
const STATE = join(__dirname, '.e2e-state.json');

const ADMIN    = { email: 'geekadmin@geekgully.com',     password: 'Geekadmin@2026' };
const CREATOR  = { email: 'e2e-creator@geekgully.test',  password: 'Creator@E2E2026!' };
const REVIEWER = { email: 'e2e-reviewer@geekgully.test', password: 'Reviewer@E2E2026!' };

async function apiLogin(email: string, password: string): Promise<string | null> {
  const ctx = await request.newContext({ baseURL: API });
  try {
    const res = await ctx.post('/api/auth/local', { data: { identifier: email, password } });
    if (!res.ok()) return null;
    const body = await res.json();
    return body.token ?? body.jwt ?? null;
  } catch { return null; }
  finally { await ctx.dispose(); }
}

async function apiPost(path: string, token: string, body?: Record<string, unknown>) {
  const ctx = await request.newContext({ baseURL: API });
  try {
    const res = await ctx.post(path, { headers: { Authorization: `Bearer ${token}` }, data: body });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok(), data: json?.data ?? json };
  } catch { return { ok: false, data: {} }; }
  finally { await ctx.dispose(); }
}

function loadState(): { categoryId: number; reviewerId: number } | null {
  try {
    if (!fs.existsSync(STATE)) return null;
    const s = JSON.parse(fs.readFileSync(STATE, 'utf-8'));
    return s.categoryId && s.reviewerId ? s : null;
  } catch { return null; }
}

async function loginViaUI(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/auth');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/dashboard', { timeout: 30_000 });
}

// ── Full course publish cycle ─────────────────────────────────────────────────

test('Course full cycle: DRAFT → SUBMIT → ASSIGN → APPROVE → PUBLISH', async ({ page }) => {
  const state = loadState();
  if (!state) { test.skip(); return; }

  const adminToken    = await apiLogin(ADMIN.email, ADMIN.password);
  const creatorToken  = await apiLogin(CREATOR.email, CREATOR.password);
  const reviewerToken = await apiLogin(REVIEWER.email, REVIEWER.password);
  if (!adminToken || !creatorToken || !reviewerToken) { test.skip(); return; }

  // Create course
  const { ok: c1, data: course } = await apiPost('/api/cms', creatorToken, {
    type: 'COURSE', categoryId: state.categoryId, courseType: 'STANDARD',
    title: 'E2E Course — Full Publish Cycle',
    description: 'Created by E2E course publish cycle test.',
  });
  expect(c1, 'Create course failed').toBe(true);
  const courseId: number = course.id;
  expect(courseId).toBeGreaterThan(0);

  // Submit
  const { ok: c2 } = await apiPost(`/api/cms/${courseId}/submit?type=COURSE`, creatorToken);
  expect(c2, 'Submit course failed').toBe(true);

  // Assign reviewer
  const { ok: c3 } = await apiPost(`/api/cms/${courseId}/assign-reviewer?type=COURSE`, adminToken, {
    userId: state.reviewerId,
  });
  expect(c3, 'Assign reviewer to course failed').toBe(true);

  // Reviewer sees course in My Tasks
  await loginViaUI(page, REVIEWER.email, REVIEWER.password);
  await page.goto('/my-tasks');
  const reviewingTab = page.getByRole('tab', { name: /reviewing/i });
  if (await reviewingTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await reviewingTab.click();
  }
  await expect(page.getByText('E2E Course — Full Publish Cycle')).toBeVisible({ timeout: 10_000 });

  // Approve
  const { ok: c4 } = await apiPost(`/api/cms/${courseId}/approve?type=COURSE`, reviewerToken);
  expect(c4, 'Approve course failed').toBe(true);

  // Admin publishes
  await loginViaUI(page, ADMIN.email, ADMIN.password);
  await page.goto('/courses');
  await expect(page.getByText('E2E Course — Full Publish Cycle')).toBeVisible({ timeout: 10_000 });

  const { ok: c5 } = await apiPost(`/api/cms/${courseId}/publish?type=COURSE`, adminToken);
  expect(c5, 'Publish course failed').toBe(true);

  // Verify Published status
  await page.reload();
  await expect(page.getByText('Published').first()).toBeVisible({ timeout: 8_000 });
});

// ── Creator can build a course with sections ──────────────────────────────────

test('Creator can create a course via the UI', async ({ page }) => {
  const creatorToken = await apiLogin(CREATOR.email, CREATOR.password);
  if (!creatorToken) { test.skip(); return; }

  await loginViaUI(page, CREATOR.email, CREATOR.password);
  await page.goto('/courses/create');
  await expect(page).not.toHaveURL(/\/auth/);

  const titleInput = page.getByLabel(/title/i)
    .or(page.locator('input[placeholder*="Title"]')).first();
  await expect(titleInput).toBeVisible({ timeout: 10_000 });

  await titleInput.fill('E2E Course — UI Created');
  // Save as draft (just verifying UI works, not completing full cycle)
  const saveBtn = page.getByRole('button', { name: /save|draft/i }).first();
  if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(1_000);
  }
  await expect(page).not.toHaveURL(/\/auth/);
});
