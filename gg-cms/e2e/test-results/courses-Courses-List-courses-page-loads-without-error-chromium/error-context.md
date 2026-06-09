# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: courses.spec.ts >> Courses List >> courses page loads without error
- Location: specs/courses.spec.ts:41:7

# Error details

```
AxiosError: Request failed with status code 429
```

# Test source

```ts
  1   | /**
  2   |  * Courses E2E tests
  3   |  * Covers: list, create course, add section, enroll
  4   |  */
  5   | import { test, expect, Page } from '@playwright/test';
  6   | import axios from 'axios';
  7   | import { authBypassHeaders, enableAuthBypass } from '../fixtures/auth';
  8   | 
  9   | const API = process.env.API_BASE_URL || 'http://localhost:1337/api';
  10  | 
  11  | let userEmail: string;
  12  | let userPassword: string;
  13  | 
  14  | test.beforeAll(async () => {
  15  |   const ts = Date.now();
  16  |   userEmail = `e2e_courses_${ts}@test.local`;
  17  |   userPassword = 'Courses@E2E1';
> 18  |   await axios.post(
      |   ^ AxiosError: Request failed with status code 429
  19  |     `${API}/auth/local/register`,
  20  |     {
  21  |       username: `e2e_courses_${ts}`,
  22  |       email: userEmail,
  23  |       password: userPassword,
  24  |       name: 'E2E Courses User',
  25  |     },
  26  |     { headers: authBypassHeaders },
  27  |   );
  28  | });
  29  | 
  30  | async function loginUser(page: Page) {
  31  |   await enableAuthBypass(page);
  32  |   await page.goto('/auth');
  33  |   await page.waitForLoadState('networkidle');
  34  |   await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(userEmail);
  35  |   await page.locator('input[type="password"]').first().fill(userPassword);
  36  |   await page.locator('button[type="submit"]').first().click();
  37  |   await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  38  | }
  39  | 
  40  | test.describe('Courses List', () => {
  41  |   test('courses page loads without error', async ({ page }) => {
  42  |     await loginUser(page);
  43  |     await page.goto('/courses');
  44  |     await page.waitForLoadState('networkidle');
  45  | 
  46  |     expect(page.url()).not.toContain('/auth');
  47  |     await expect(page.locator('text="Something went wrong"')).not.toBeVisible();
  48  |   });
  49  | 
  50  |   test('courses page shows list or empty state', async ({ page }) => {
  51  |     await loginUser(page);
  52  |     await page.goto('/courses');
  53  |     await page.waitForLoadState('networkidle');
  54  | 
  55  |     const content = page.locator(
  56  |       'table, [data-testid="course-list"], [data-testid="empty-state"], .empty-state, text=/no courses/i',
  57  |     ).first();
  58  |     await expect(content).toBeVisible({ timeout: 10_000 });
  59  |   });
  60  | });
  61  | 
  62  | test.describe('Create Course', () => {
  63  |   test('create course button is visible', async ({ page }) => {
  64  |     await loginUser(page);
  65  |     await page.goto('/courses');
  66  |     await page.waitForLoadState('networkidle');
  67  | 
  68  |     const createBtn = page.locator(
  69  |       'button:has-text("Create"), button:has-text("New"), a:has-text("New Course"), [data-testid="create-course"]',
  70  |     ).first();
  71  |     await expect(createBtn).toBeVisible({ timeout: 10_000 });
  72  |   });
  73  | 
  74  |   test('can fill course form and save', async ({ page }) => {
  75  |     await loginUser(page);
  76  |     await page.goto('/courses');
  77  |     await page.waitForLoadState('networkidle');
  78  | 
  79  |     const createBtn = page.locator(
  80  |       'button:has-text("Create"), button:has-text("New"), a:has-text("New Course"), [data-testid="create-course"]',
  81  |     ).first();
  82  | 
  83  |     if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
  84  |       test.skip(true, 'Create course button not visible');
  85  |       return;
  86  |     }
  87  | 
  88  |     await createBtn.click();
  89  |     await page.waitForLoadState('networkidle');
  90  | 
  91  |     const titleInput = page.locator('input[name="title"], input[placeholder*="title" i]').first();
  92  |     if (await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
  93  |       await titleInput.fill(`E2E Course ${Date.now()}`);
  94  | 
  95  |       const descArea = page.locator('textarea[name="description"], [contenteditable="true"], .ql-editor, .ProseMirror').first();
  96  |       if (await descArea.isVisible({ timeout: 3000 }).catch(() => false)) {
  97  |         await descArea.fill('Course description for E2E test.');
  98  |       }
  99  | 
  100 |       const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]').first();
  101 |       await saveBtn.click();
  102 |       await page.waitForTimeout(2000);
  103 |       expect(page.url()).not.toContain('error');
  104 |     }
  105 |   });
  106 | });
  107 | 
  108 | test.describe('Public Course View', () => {
  109 |   test('/public/courses page loads if it exists', async ({ page }) => {
  110 |     await page.goto('/explore/programming');
  111 |     await page.waitForLoadState('networkidle');
  112 |     // Either shows content or 404 — should not crash
  113 |     await expect(page.locator('text="Something went wrong"')).not.toBeVisible();
  114 |   });
  115 | 
  116 |   test('/course/:id shows 404 or redirect for non-existent course', async ({ page }) => {
  117 |     await page.goto('/course/999999');
  118 |     await page.waitForLoadState('networkidle');
```