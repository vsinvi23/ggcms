# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> Dashboard >> can navigate to /categories via direct URL
- Location: specs/dashboard.spec.ts:79:7

# Error details

```
AxiosError: Request failed with status code 429
```

# Test source

```ts
  1  | /**
  2  |  * Dashboard E2E tests
  3  |  * Covers: navigation, sidebar links, user info display, API data loading
  4  |  */
  5  | import { test, expect, Page } from '@playwright/test';
  6  | import axios from 'axios';
  7  | import { authBypassHeaders, enableAuthBypass } from '../fixtures/auth';
  8  | 
  9  | const API = process.env.API_BASE_URL || 'http://localhost:1337/api';
  10 | 
  11 | async function createAndLoginUser(page: Page) {
  12 |   const ts = Date.now();
  13 |   const email = `e2e_db_${ts}@test.local`;
  14 |   const password = 'Dashboard@E2E1';
> 15 |   await axios.post(
     |   ^ AxiosError: Request failed with status code 429
  16 |     `${API}/auth/local/register`,
  17 |     {
  18 |       username: `e2e_db_${ts}`,
  19 |       email,
  20 |       password,
  21 |       name: 'E2E Dashboard User',
  22 |     },
  23 |     { headers: authBypassHeaders },
  24 |   );
  25 | 
  26 |   await enableAuthBypass(page);
  27 |   await page.goto('/auth');
  28 |   await page.waitForLoadState('networkidle');
  29 |   await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email);
  30 |   await page.locator('input[type="password"]').first().fill(password);
  31 |   await page.locator('button[type="submit"]').first().click();
  32 |   await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  33 | }
  34 | 
  35 | test.describe('Dashboard', () => {
  36 |   test('dashboard page loads after login', async ({ page }) => {
  37 |     await createAndLoginUser(page);
  38 |     await page.goto('/dashboard');
  39 |     await page.waitForLoadState('networkidle');
  40 | 
  41 |     expect(page.url()).not.toContain('/auth');
  42 |     // Page should have some content
  43 |     await expect(page.locator('body')).not.toBeEmpty();
  44 |   });
  45 | 
  46 |   test('dashboard does not show a full-page error', async ({ page }) => {
  47 |     await createAndLoginUser(page);
  48 |     await page.goto('/dashboard');
  49 |     await page.waitForLoadState('networkidle');
  50 | 
  51 |     // No uncaught error boundary visible
  52 |     const errorBoundary = page.locator('text="Something went wrong"').first();
  53 |     await expect(errorBoundary).not.toBeVisible();
  54 |   });
  55 | 
  56 |   test('navigation sidebar is visible', async ({ page }) => {
  57 |     await createAndLoginUser(page);
  58 |     await page.goto('/dashboard');
  59 |     await page.waitForLoadState('networkidle');
  60 | 
  61 |     const nav = page.locator('nav, aside, [role="navigation"]').first();
  62 |     await expect(nav).toBeVisible({ timeout: 10_000 });
  63 |   });
  64 | 
  65 |   test('can navigate to /articles via sidebar or direct URL', async ({ page }) => {
  66 |     await createAndLoginUser(page);
  67 |     await page.goto('/articles');
  68 |     await page.waitForLoadState('networkidle');
  69 |     expect(page.url()).not.toContain('/auth');
  70 |   });
  71 | 
  72 |   test('can navigate to /courses via direct URL', async ({ page }) => {
  73 |     await createAndLoginUser(page);
  74 |     await page.goto('/courses');
  75 |     await page.waitForLoadState('networkidle');
  76 |     expect(page.url()).not.toContain('/auth');
  77 |   });
  78 | 
  79 |   test('can navigate to /categories via direct URL', async ({ page }) => {
  80 |     await createAndLoginUser(page);
  81 |     await page.goto('/categories');
  82 |     await page.waitForLoadState('networkidle');
  83 |     expect(page.url()).not.toContain('/auth');
  84 |   });
  85 | 
  86 |   test('unauthenticated user is redirected from /dashboard', async ({ page }) => {
  87 |     // Don't login
  88 |     await page.goto('/dashboard');
  89 |     await page.waitForURL('**/auth**', { timeout: 10_000 });
  90 |     expect(page.url()).toContain('/auth');
  91 |   });
  92 | 
  93 |   test('unauthenticated user is redirected from /articles', async ({ page }) => {
  94 |     await page.goto('/articles');
  95 |     await page.waitForURL('**/auth**', { timeout: 10_000 });
  96 |     expect(page.url()).toContain('/auth');
  97 |   });
  98 | });
  99 | 
```