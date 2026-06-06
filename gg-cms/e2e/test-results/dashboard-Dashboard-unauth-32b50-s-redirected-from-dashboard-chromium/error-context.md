# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> Dashboard >> unauthenticated user is redirected from /dashboard
- Location: specs\dashboard.spec.ts:75:7

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:8081/dashboard
Call log:
  - navigating to "http://localhost:8081/dashboard", waiting until "load"

```

# Test source

```ts
  1  | /**
  2  |  * Dashboard E2E tests
  3  |  * Covers: navigation, sidebar links, user info display, API data loading
  4  |  */
  5  | import { test, expect, Page } from '@playwright/test';
  6  | import axios from 'axios';
  7  | 
  8  | const API = process.env.API_BASE_URL || 'http://localhost:1337/api';
  9  | 
  10 | async function createAndLoginUser(page: Page) {
  11 |   const ts = Date.now();
  12 |   const email = `e2e_db_${ts}@test.local`;
  13 |   const password = 'Dashboard@E2E1';
  14 |   await axios.post(`${API}/auth/local/register`, { username: `e2e_db_${ts}`, email, password });
  15 | 
  16 |   await page.goto('/auth');
  17 |   await page.waitForLoadState('networkidle');
  18 |   await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email);
  19 |   await page.locator('input[type="password"]').first().fill(password);
  20 |   await page.locator('button[type="submit"]').first().click();
  21 |   await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  22 | }
  23 | 
  24 | test.describe('Dashboard', () => {
  25 |   test('dashboard page loads after login', async ({ page }) => {
  26 |     await createAndLoginUser(page);
  27 |     await page.goto('/dashboard');
  28 |     await page.waitForLoadState('networkidle');
  29 | 
  30 |     expect(page.url()).not.toContain('/auth');
  31 |     // Page should have some content
  32 |     await expect(page.locator('body')).not.toBeEmpty();
  33 |   });
  34 | 
  35 |   test('dashboard does not show a full-page error', async ({ page }) => {
  36 |     await createAndLoginUser(page);
  37 |     await page.goto('/dashboard');
  38 |     await page.waitForLoadState('networkidle');
  39 | 
  40 |     // No uncaught error boundary visible
  41 |     const errorBoundary = page.locator('text="Something went wrong"').first();
  42 |     await expect(errorBoundary).not.toBeVisible();
  43 |   });
  44 | 
  45 |   test('navigation sidebar is visible', async ({ page }) => {
  46 |     await createAndLoginUser(page);
  47 |     await page.goto('/dashboard');
  48 |     await page.waitForLoadState('networkidle');
  49 | 
  50 |     const nav = page.locator('nav, aside, [role="navigation"]').first();
  51 |     await expect(nav).toBeVisible({ timeout: 10_000 });
  52 |   });
  53 | 
  54 |   test('can navigate to /articles via sidebar or direct URL', async ({ page }) => {
  55 |     await createAndLoginUser(page);
  56 |     await page.goto('/articles');
  57 |     await page.waitForLoadState('networkidle');
  58 |     expect(page.url()).not.toContain('/auth');
  59 |   });
  60 | 
  61 |   test('can navigate to /courses via direct URL', async ({ page }) => {
  62 |     await createAndLoginUser(page);
  63 |     await page.goto('/courses');
  64 |     await page.waitForLoadState('networkidle');
  65 |     expect(page.url()).not.toContain('/auth');
  66 |   });
  67 | 
  68 |   test('can navigate to /categories via direct URL', async ({ page }) => {
  69 |     await createAndLoginUser(page);
  70 |     await page.goto('/categories');
  71 |     await page.waitForLoadState('networkidle');
  72 |     expect(page.url()).not.toContain('/auth');
  73 |   });
  74 | 
  75 |   test('unauthenticated user is redirected from /dashboard', async ({ page }) => {
  76 |     // Don't login
> 77 |     await page.goto('/dashboard');
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:8081/dashboard
  78 |     await page.waitForURL('**/auth**', { timeout: 10_000 });
  79 |     expect(page.url()).toContain('/auth');
  80 |   });
  81 | 
  82 |   test('unauthenticated user is redirected from /articles', async ({ page }) => {
  83 |     await page.goto('/articles');
  84 |     await page.waitForURL('**/auth**', { timeout: 10_000 });
  85 |     expect(page.url()).toContain('/auth');
  86 |   });
  87 | });
  88 | 
```