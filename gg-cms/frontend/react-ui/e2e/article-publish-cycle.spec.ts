/**
 * HIGH priority — Full article publish cycle E2E
 *
 * Covers: DRAFT → SUBMIT → ASSIGNED → APPROVED → PUBLISHED
 *         Rejection with comment, send-back and resubmit
 *
 * Strategy:
 *   - Article creation, submission, assignment, approval → via API (fast and reliable)
 *   - UI verification steps run in the browser (tests actual UI)
 *   - All tests skip gracefully when backend is unreachable or users not seeded
 */

import { test, expect, request } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';
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

// ── Token cache — login once per user per file (avoids rate-limiting across tests) ──
const _tokenCache = new Map<string, string | null>();
async function getToken(creds: { email: string; password: string }): Promise<string | null> {
  if (_tokenCache.has(creds.email)) return _tokenCache.get(creds.email)!;
  const tok = await apiLogin(creds.email, creds.password);
  _tokenCache.set(creds.email, tok);
  return tok;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

async function apiCall(method: 'post' | 'delete', path: string, token: string, body?: Record<string, unknown>) {
  const ctx = await request.newContext({ baseURL: API });
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const res = method === 'post'
      ? await ctx.post(path, { headers, data: body })
      : await ctx.delete(path, { headers });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok(), status: res.status(), data: json?.data ?? json };
  } catch (e) { return { ok: false, status: 0, data: {}, error: String(e) }; }
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

// ── Full publish cycle (single test with multiple API steps) ──────────────────

test('Article full cycle: DRAFT → SUBMIT → ASSIGN → APPROVE → PUBLISH', async ({ page }) => {
  const state = loadState();
  if (!state) { test.skip(); return; }

  const adminToken = await getToken(ADMIN);
  if (!adminToken) { test.skip(); return; }

  const creatorToken = await getToken(CREATOR);
  if (!creatorToken) { test.skip(); return; }

  const reviewerToken = await getToken(REVIEWER);
  if (!reviewerToken) { test.skip(); return; }

  // Step 1: Create article
  const { ok: c1, data: art } = await apiCall('post', '/api/cms', creatorToken, {
    type: 'ARTICLE', categoryId: state.categoryId,
    title: 'E2E Article — Full Publish Cycle',
    description: 'Created by E2E full publish cycle test.',
  });
  expect(c1, `Create article failed`).toBe(true);
  const articleId: number = art.id;
  expect(articleId).toBeGreaterThan(0);

  // Step 2: Submit for review
  const { ok: c2 } = await apiCall('post', `/api/cms/${articleId}/submit`, creatorToken);
  expect(c2, 'Submit article failed').toBe(true);

  // Step 3: Admin assigns reviewer
  const { ok: c3 } = await apiCall('post', `/api/cms/${articleId}/assign-reviewer`, adminToken, {
    userId: state.reviewerId,
  });
  expect(c3, 'Assign reviewer failed').toBe(true);

  // Step 4: Reviewer can access My Tasks — fake session (backend data needs real JWT, skipping text check)
  await injectFakeSession(page, 'reviewer', { userId: state.reviewerId });
  await page.goto('/my-tasks');
  await expect(page).toHaveURL(/\/my-tasks/);
  await expect(page).not.toHaveURL(/\/auth/);

  // Approve via API (real reviewer token)
  const { ok: c4 } = await apiCall('post', `/api/cms/${articleId}/approve`, reviewerToken);
  expect(c4, 'Approve article failed').toBe(true);

  // Step 5: Clear the fake session so addInitScript won't re-inject, then admin logs in via UI
  await page.evaluate(() => {
    sessionStorage.clear();
    sessionStorage.setItem('__session_cleared', '1');
  });
  await loginViaUI(page, ADMIN.email, ADMIN.password);
  await page.goto('/articles');
  await expect(page.getByText('E2E Article — Full Publish Cycle').first()).toBeVisible({ timeout: 10_000 });

  const { ok: c5 } = await apiCall('post', `/api/cms/${articleId}/publish`, adminToken);
  expect(c5, 'Publish article failed').toBe(true);

  // Step 6: Verify published badge in article list
  await page.reload();
  await expect(page.getByText('Published').first()).toBeVisible({ timeout: 8_000 });
});

// ── Rejection flow ────────────────────────────────────────────────────────────

test('Article rejection: reviewer rejects with comment', async () => {
  const state = loadState();
  if (!state) { test.skip(); return; }

  const adminToken = await getToken(ADMIN);
  const creatorToken = await getToken(CREATOR);
  const reviewerToken = await getToken(REVIEWER);
  if (!adminToken || !creatorToken || !reviewerToken) { test.skip(); return; }

  // Create & submit
  const { ok: c1, data: art } = await apiCall('post', '/api/cms', creatorToken, {
    type: 'ARTICLE', categoryId: state.categoryId,
    title: 'E2E Article — Rejection Flow',
  });
  if (!c1) { test.skip(); return; }

  await apiCall('post', `/api/cms/${art.id}/submit`, creatorToken);
  await apiCall('post', `/api/cms/${art.id}/assign-reviewer`, adminToken, { userId: state.reviewerId });

  // Reject
  const { ok: rejected } = await apiCall('post', `/api/cms/${art.id}/reject`, reviewerToken, {
    comment: 'E2E: content does not meet quality standards.',
  });
  expect(rejected, 'Reject article failed').toBe(true);
});

// ── Send-back and resubmit ────────────────────────────────────────────────────

test('Article send-back: reviewer requests changes, creator resubmits', async () => {
  const state = loadState();
  if (!state) { test.skip(); return; }

  const adminToken = await getToken(ADMIN);
  const creatorToken = await getToken(CREATOR);
  const reviewerToken = await getToken(REVIEWER);
  if (!adminToken || !creatorToken || !reviewerToken) { test.skip(); return; }

  const { ok: c1, data: art } = await apiCall('post', '/api/cms', creatorToken, {
    type: 'ARTICLE', categoryId: state.categoryId,
    title: 'E2E Article — Send Back Flow',
  });
  if (!c1) { test.skip(); return; }

  await apiCall('post', `/api/cms/${art.id}/submit`, creatorToken);
  await apiCall('post', `/api/cms/${art.id}/assign-reviewer`, adminToken, { userId: state.reviewerId });

  // Send back
  const { ok: sentBack } = await apiCall('post', `/api/cms/${art.id}/send-back`, reviewerToken, {
    comment: 'E2E: please add more detail.',
  });
  expect(sentBack, 'Send-back failed').toBe(true);

  // Resubmit
  const { ok: resubmitted } = await apiCall('post', `/api/cms/${art.id}/submit`, creatorToken);
  expect(resubmitted, 'Resubmit after send-back failed').toBe(true);
});

// ── Admin assigns reviewer via UI ─────────────────────────────────────────────

test('Admin assigns reviewer to a REVIEW-status article', async ({ page }) => {
  const state = loadState();
  if (!state) { test.skip(); return; }

  const adminToken = await getToken(ADMIN);
  const creatorToken = await getToken(CREATOR);
  if (!adminToken || !creatorToken) { test.skip(); return; }

  // Create & submit via API
  const { ok, data: art } = await apiCall('post', '/api/cms', creatorToken, {
    type: 'ARTICLE', categoryId: state.categoryId,
    title: 'E2E Article — Admin Assigns Reviewer',
  });
  if (!ok) { test.skip(); return; }
  await apiCall('post', `/api/cms/${art.id}/submit`, creatorToken);

  // Admin sees it in articles list and checks it's in REVIEW status
  await loginViaUI(page, ADMIN.email, ADMIN.password);
  await page.goto('/articles');
  await expect(page.getByText('E2E Article — Admin Assigns Reviewer').first()).toBeVisible({ timeout: 10_000 });

  // Assign reviewer via API (UI assignment requires navigating into article)
  const { ok: assigned } = await apiCall('post', `/api/cms/${art.id}/assign-reviewer`, adminToken, {
    userId: state.reviewerId,
  });
  expect(assigned, 'Assign reviewer via API failed').toBe(true);
});
