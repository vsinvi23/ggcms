# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: articles.spec.ts >> Articles List >> articles page renders a list or empty state
- Location: specs\articles.spec.ts:36:7

# Error details

```
Error: read ECONNRESET
```

# Test source

```ts
  1   | /**
  2   |  * Articles E2E tests
  3   |  * Covers: list, create, view, edit, submit for review
  4   |  */
  5   | import { test, expect, Page } from '@playwright/test';
  6   | import axios from 'axios';
  7   | 
  8   | const API = process.env.API_BASE_URL || 'http://localhost:1337/api';
  9   | 
  10  | let jwt: string;
  11  | let userEmail: string;
  12  | let userPassword: string;
  13  | 
  14  | test.beforeAll(async () => {
  15  |   const ts = Date.now();
  16  |   userEmail = `e2e_articles_${ts}@test.local`;
  17  |   userPassword = 'Articles@E2E1';
> 18  |   const reg = await axios.post(`${API}/auth/local/register`, {
      |               ^ Error: read ECONNRESET
  19  |     username: `e2e_articles_${ts}`,
  20  |     email: userEmail,
  21  |     password: userPassword,
  22  |   });
  23  |   jwt = reg.data.jwt;
  24  | });
  25  | 
  26  | async function loginUser(page: Page) {
  27  |   await page.goto('/auth');
  28  |   await page.waitForLoadState('networkidle');
  29  |   await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(userEmail);
  30  |   await page.locator('input[type="password"]').first().fill(userPassword);
  31  |   await page.locator('button[type="submit"]').first().click();
  32  |   await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  33  | }
  34  | 
  35  | test.describe('Articles List', () => {
  36  |   test('articles page renders a list or empty state', async ({ page }) => {
  37  |     await loginUser(page);
  38  |     await page.goto('/articles');
  39  |     await page.waitForLoadState('networkidle');
  40  | 
  41  |     // Should show either a table/list or empty-state message
  42  |     const content = page.locator('table, [data-testid="article-list"], [data-testid="empty-state"], .empty-state, text="No articles"').first();
  43  |     await expect(content).toBeVisible({ timeout: 10_000 });
  44  |   });
  45  | 
  46  |   test('articles page does not show a network error toast', async ({ page }) => {
  47  |     await loginUser(page);
  48  | 
  49  |     // Listen for console errors that indicate failed API calls
  50  |     const errors: string[] = [];
  51  |     page.on('console', (msg) => {
  52  |       if (msg.type() === 'error') errors.push(msg.text());
  53  |     });
  54  | 
  55  |     await page.goto('/articles');
  56  |     await page.waitForLoadState('networkidle');
  57  |     await page.waitForTimeout(2000);
  58  | 
  59  |     // No uncaught TypeError/NetworkError in console
  60  |     const networkErrors = errors.filter((e) => e.includes('Network') || e.includes('fetch') || e.includes('500'));
  61  |     expect(networkErrors).toHaveLength(0);
  62  |   });
  63  | });
  64  | 
  65  | test.describe('Create Article', () => {
  66  |   test('create article button/link is visible on articles page', async ({ page }) => {
  67  |     await loginUser(page);
  68  |     await page.goto('/articles');
  69  |     await page.waitForLoadState('networkidle');
  70  | 
  71  |     const createBtn = page.locator(
  72  |       'button:has-text("Create"), button:has-text("New"), a:has-text("Create"), a:has-text("New Article"), [data-testid="create-article"]',
  73  |     ).first();
  74  |     await expect(createBtn).toBeVisible({ timeout: 10_000 });
  75  |   });
  76  | 
  77  |   test('can fill article form and submit (creates draft)', async ({ page }) => {
  78  |     await loginUser(page);
  79  |     await page.goto('/articles');
  80  |     await page.waitForLoadState('networkidle');
  81  | 
  82  |     // Click create button
  83  |     const createBtn = page.locator(
  84  |       'button:has-text("Create"), button:has-text("New"), a:has-text("Create"), a:has-text("New Article"), [data-testid="create-article"]',
  85  |     ).first();
  86  | 
  87  |     if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
  88  |       test.skip(true, 'Create button not found — UI may differ');
  89  |       return;
  90  |     }
  91  | 
  92  |     await createBtn.click();
  93  |     await page.waitForLoadState('networkidle');
  94  | 
  95  |     // Fill title
  96  |     const titleInput = page.locator('input[name="title"], input[placeholder*="title" i], textarea[name="title"]').first();
  97  |     if (await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
  98  |       await titleInput.fill(`E2E Article ${Date.now()}`);
  99  | 
  100 |       // Fill content (may be a rich text editor or textarea)
  101 |       const contentArea = page.locator('textarea[name="content"], [contenteditable="true"], .ql-editor, .ProseMirror').first();
  102 |       if (await contentArea.isVisible({ timeout: 3000 }).catch(() => false)) {
  103 |         await contentArea.fill('E2E test article content here.');
  104 |       }
  105 | 
  106 |       // Save/submit
  107 |       const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]').first();
  108 |       await saveBtn.click();
  109 |       await page.waitForTimeout(2000);
  110 | 
  111 |       // Should not be on an error page
  112 |       expect(page.url()).not.toContain('error');
  113 |     }
  114 |   });
  115 | });
  116 | 
  117 | test.describe('Public Article View', () => {
  118 |   test('GET / renders public articles feed', async ({ page }) => {
```