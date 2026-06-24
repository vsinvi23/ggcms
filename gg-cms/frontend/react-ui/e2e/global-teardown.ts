/**
 * Playwright global teardown — cleans up E2E test content.
 *
 * Deletes CMS content (articles, courses) whose title starts with "E2E " to avoid
 * polluting the development database.  Users, groups, and categories created during
 * global setup are left in place so the next run re-uses them (idempotent).
 */

import { request } from '@playwright/test';

const API = process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:1337';

async function globalTeardown() {
  const ctx = await request.newContext({ baseURL: API });
  try { await _cleanup(ctx); } catch (e) {
    console.warn('[teardown] Non-fatal cleanup error:', (e as Error).message);
  } finally {
    await ctx.dispose();
  }
}

async function _cleanup(ctx: Awaited<ReturnType<typeof request.newContext>>) {

  // ── Login as admin ──────────────────────────────────────────────────────────
  let token: string | undefined;
  try {
    const loginRes = await ctx.post('/api/auth/local', {
      data: {
        identifier: 'geekadmin@geekgully.com',
        password: 'Geekadmin@2026',
      },
    });
    if (!loginRes.ok()) {
      console.warn('[teardown] Admin login failed — skipping cleanup');
      return;
    }
    const loginBody = await loginRes.json();
    token = loginBody.token ?? loginBody.jwt;
  } catch (e) {
    console.warn('[teardown] Admin login error — skipping cleanup:', (e as Error).message);
    return;
  }
  const auth = { Authorization: `Bearer ${token}` };

  // ── Delete E2E CMS content ──────────────────────────────────────────────────
  console.log('[teardown] Removing E2E test CMS content...');
  let deleted = 0;
  for (const type of ['ARTICLE', 'COURSE'] as const) {
    let page = 1;
    while (true) {
      let items: { id: number; title: string | null }[] = [];
      let total = 0;
      try {
        const res = await ctx.get('/api/cms', {
          headers: auth,
          params: { type, page, pageSize: 50 },
        });
        if (!res.ok()) break;
        const body = await res.json();
        items = body?.data?.items ?? [];
        total = body?.data?.totalElements ?? 0;
      } catch (e) {
        console.warn(`[teardown] Failed to list ${type} page ${page}:`, (e as Error).message);
        break;
      }
      if (items.length === 0) break;

      for (const item of items) {
        if (item.title?.startsWith('E2E ') || item.title?.startsWith('[E2E]')) {
          try {
            const del = await ctx.delete(`/api/cms/${item.id}`, { headers: auth });
            if (del.ok()) deleted++;
          } catch (e) {
            console.warn(`[teardown] Failed to delete item ${item.id}:`, (e as Error).message);
          }
        }
      }

      if (page * 50 >= total) break;
      page++;
    }
  }
  console.log(`[teardown] Deleted ${deleted} E2E content items.`);
}

export default globalTeardown;
