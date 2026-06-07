/**
 * Playwright global setup — seeds the E2E test database.
 *
 * Creates (if they don't already exist):
 *   - 3 test users: creator, reviewer, learner
 *   - 1 review group: "E2E Reviewers" with the reviewer as member
 *   - 1 test category: "E2E Test Category" linked to the review group
 *
 * Saves the resulting IDs to e2e/.e2e-state.json for use in specs.
 *
 * Designed to be idempotent: safe to re-run on a database that already
 * has the seed data from a previous run.
 */

import { request } from '@playwright/test';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:1337';
const STATE_FILE = join(__dirname, '.e2e-state.json');

export const E2E_USERS = {
  creator: {
    name: 'E2E Creator',
    email: 'e2e-creator@geekgully.test',
    password: 'Creator@E2E2026!',
    role: 'creator',
  },
  reviewer: {
    name: 'E2E Reviewer',
    email: 'e2e-reviewer@geekgully.test',
    password: 'Reviewer@E2E2026!',
    role: 'reviewer',
  },
  learner: {
    name: 'E2E Learner',
    email: 'e2e-learner@geekgully.test',
    password: 'Learner@E2E2026!',
    role: 'learner',
  },
};

export const ADMIN = {
  email: 'geekadmin@geekgully.com',
  password: 'Geekadmin@2026',
};

async function globalSetup() {
  const ctx = await request.newContext({ baseURL: API });

  // ── Login as admin ──────────────────────────────────────────────────────────
  const loginRes = await ctx.post('/api/auth/local', {
    data: { identifier: ADMIN.email, password: ADMIN.password },
  });
  if (!loginRes.ok()) {
    throw new Error(`Admin login failed: ${loginRes.status()} — is the backend running at ${API}?`);
  }
  const loginBody = await loginRes.json();
  const token = loginBody.token ?? loginBody.jwt;
  const auth = { Authorization: `Bearer ${token}` };

  // ── Helper: find or create user ─────────────────────────────────────────────
  async function ensureUser(user: { name: string; email: string; password: string }): Promise<number> {
    const listRes = await ctx.get('/api/users', { headers: auth });
    if (listRes.ok()) {
      const body = await listRes.json();
      const items: { id: number; email: string }[] = body?.data?.items ?? body?.data ?? [];
      const existing = items.find(u => u.email === user.email);
      if (existing) return existing.id;
    }

    const createRes = await ctx.post('/api/users', {
      headers: auth,
      data: { name: user.name, email: user.email, password: user.password },
    });
    if (!createRes.ok()) {
      throw new Error(`Failed to create user ${user.email}: ${createRes.status()} ${await createRes.text()}`);
    }
    const body = await createRes.json();
    return body?.data?.id ?? body?.id;
  }

  // ── Helper: find or create group ────────────────────────────────────────────
  async function ensureGroup(name: string): Promise<number> {
    const listRes = await ctx.get('/api/user-groups', { headers: auth });
    if (listRes.ok()) {
      const body = await listRes.json();
      const items: { id: number; name: string }[] = body?.data?.items ?? body?.data ?? [];
      const existing = items.find(g => g.name === name);
      if (existing) return existing.id;
    }

    const createRes = await ctx.post('/api/user-groups', {
      headers: auth,
      data: {
        data: {
          name,
          permissions: {
            articles: { view: true, create: true, edit: true, review: true, approve: true, publish: true },
            courses:  { view: true, create: true, edit: true, review: true, approve: true, publish: true },
          },
        },
      },
    });
    if (!createRes.ok()) {
      throw new Error(`Failed to create group ${name}: ${createRes.status()} ${await createRes.text()}`);
    }
    const body = await createRes.json();
    return body?.data?.id ?? body?.id;
  }

  // ── Helper: find or create category ────────────────────────────────────────
  async function ensureCategory(name: string): Promise<number> {
    const listRes = await ctx.get('/api/categories', { headers: auth });
    if (listRes.ok()) {
      const body = await listRes.json();
      const items: { id: number; name: string }[] = Array.isArray(body?.data) ? body.data : [];
      const flat = items.flatMap(c => [c, ...((c as { children?: typeof items }).children ?? [])]);
      const existing = flat.find(c => c.name === name);
      if (existing) return existing.id;
    }

    const createRes = await ctx.post('/api/categories', {
      headers: auth,
      data: { data: { name, requiredApprovals: 1 } },
    });
    if (!createRes.ok()) {
      throw new Error(`Failed to create category ${name}: ${createRes.status()} ${await createRes.text()}`);
    }
    const body = await createRes.json();
    return body?.data?.id ?? body?.id;
  }

  // ── Seed users ──────────────────────────────────────────────────────────────
  console.log('[setup] Creating E2E test users...');
  const creatorId  = await ensureUser(E2E_USERS.creator);
  const reviewerId = await ensureUser(E2E_USERS.reviewer);
  const learnerId  = await ensureUser(E2E_USERS.learner);
  console.log(`[setup] Users: creator=${creatorId}, reviewer=${reviewerId}, learner=${learnerId}`);

  // ── Seed review group ───────────────────────────────────────────────────────
  console.log('[setup] Creating E2E Reviewers group...');
  const groupId = await ensureGroup('E2E Reviewers');
  // Add reviewer to group
  await ctx.post(`/api/user-groups/${groupId}/members`, {
    headers: auth,
    data: { userId: reviewerId },
  });
  console.log(`[setup] Group: id=${groupId}`);

  // ── Seed category ───────────────────────────────────────────────────────────
  console.log('[setup] Creating E2E Test Category...');
  const categoryId = await ensureCategory('E2E Test Category');
  // Link review group to category
  await ctx.post(`/api/categories/${categoryId}/reviewer-groups`, {
    headers: auth,
    data: { groupId },
  });
  console.log(`[setup] Category: id=${categoryId}`);

  // ── Persist state ───────────────────────────────────────────────────────────
  const state = { creatorId, reviewerId, learnerId, groupId, categoryId };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  console.log('[setup] State saved to', STATE_FILE);

  await ctx.dispose();
}

export default globalSetup;
