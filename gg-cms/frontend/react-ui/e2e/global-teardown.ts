/**
 * Playwright global teardown — cleans up E2E test content.
 *
 * Deletes CMS content (articles, courses) whose title starts with "E2E " to avoid
 * polluting the development database.  Users, groups, and categories created during
 * global setup are left in place so the next run re-uses them (idempotent).
 */

import { request } from '@playwright/test';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:1337';
const STATE_FILE = join(__dirname, '.e2e-state.json');

async function globalTeardown() {
  const ctx = await request.newContext({ baseURL: API });

  // ── Login as admin ──────────────────────────────────────────────────────────
  const loginRes = await ctx.post('/api/auth/local', {
    data: {
      identifier: 'geekadmin@geekgully.com',
      password: 'Geekadmin@2026',
    },
  });
  if (!loginRes.ok()) {
    console.warn('[teardown] Admin login failed — skipping cleanup');
    await ctx.dispose();
    return;
  }
  const loginBody = await loginRes.json();
  const token = loginBody.token ?? loginBody.jwt;
  const auth = { Authorization: `Bearer ${token}` };

  // ── Delete E2E CMS content ──────────────────────────────────────────────────
  console.log('[teardown] Removing E2E test CMS content...');
  let deleted = 0;
  for (const type of ['ARTICLE', 'COURSE'] as const) {
    let page = 1;
    while (true) {
      const res = await ctx.get('/api/cms', {
        headers: auth,
        params: { type, page, pageSize: 50 },
      });
      if (!res.ok()) break;
      const body = await res.json();
      const items: { id: number; title: string | null }[] = body?.data?.items ?? [];
      if (items.length === 0) break;

      for (const item of items) {
        if (item.title?.startsWith('E2E ') || item.title?.startsWith('[E2E]')) {
          const del = await ctx.delete(`/api/cms/${item.id}`, { headers: auth });
          if (del.ok()) deleted++;
        }
      }

      const total = body?.data?.totalElements ?? 0;
      if (page * 50 >= total) break;
      page++;
    }
  }
  console.log(`[teardown] Deleted ${deleted} E2E content items.`);

  // ── Remove state file ───────────────────────────────────────────────────────
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
    console.log('[teardown] State file removed.');
  }

  await ctx.dispose();
}

export default globalTeardown;
