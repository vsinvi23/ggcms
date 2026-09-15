import { test, expect } from '@playwright/test';

test.describe('GG-CMS Knowledge Graph & Recommendation Validation', () => {
  test('topics API returns seeded topics', async ({ request }) => {
    const response = await request.get('http://localhost:1337/api/topics');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const oauthTopic = body.data.find((t: { slug?: string; name?: string }) => t.slug === 'oauth-2' || t.name === 'OAuth 2.0');
    expect(oauthTopic).toBeDefined();
  });

  test('categories API returns default 2-level categories', async ({ request }) => {
    const response = await request.get('http://localhost:1337/api/categories');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.data)).toBe(true);

    const sweCat = body.data.find((c: { slug?: string }) => c.slug === 'software-engineering' || c.slug === 'cloud-infrastructure');
    expect(sweCat).toBeDefined();
  });

  test('login flow and authenticated recommendations API', async ({ request }) => {
    // 1. Login as admin
    const loginRes = await request.post('http://localhost:1337/api/auth/local', {
      data: {
        identifier: 'geekadmin@geekgully.com',
        password: 'Geekadmin@2026',
      },
    });
    expect(loginRes.status()).toBe(200);
    const loginBody = await loginRes.json();
    const token = loginBody.jwt || loginBody.data?.jwt || loginBody.data?.token;
    expect(token).toBeDefined();

    // 2. Fetch authenticated recommendations with mode=related
    const recRes = await request.get('http://localhost:1337/api/personalization/recommendations?mode=related&content_id=1&content_type=ARTICLE', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(recRes.status()).toBe(200);
    const recBody = await recRes.json();
    console.log('recBody response:', JSON.stringify(recBody));
    expect(recBody.success).toBe(true);
    expect(recBody.data).toBeDefined();
    expect(recBody.data.content_id).toBe(1);
    const validRecs = recBody.data.recommendations === null || Array.isArray(recBody.data.recommendations);
    expect(validRecs).toBe(true);
  });
});
