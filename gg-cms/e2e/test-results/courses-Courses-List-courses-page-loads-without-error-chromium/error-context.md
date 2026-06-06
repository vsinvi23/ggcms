# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: courses.spec.ts >> Courses List >> courses page loads without error
- Location: specs\courses.spec.ts:34:7

# Error details

```
Error: read ECONNRESET
```

# Test source

```ts
  1   | /**
  2   |  * Courses E2E tests
  3   |  * Covers: list, create course, add section, enroll
  4   |  */
  5   | import { test, expect, Page } from '@playwright/test';
  6   | import axios from 'axios';
  7   | 
  8   | const API = process.env.API_BASE_URL || 'http://localhost:1337/api';
  9   | 
  10  | let userEmail: string;
  11  | let userPassword: string;
  12  | 
  13  | test.beforeAll(async () => {
  14  |   const ts = Date.now();
  15  |   userEmail = `e2e_courses_${ts}@test.local`;
  16  |   userPassword = 'Courses@E2E1';
> 17  |   await axios.post(`${API}/auth/local/register`, {
      |   ^ Error: read ECONNRESET
  18  |     username: `e2e_courses_${ts}`,
  19  |     email: userEmail,
  20  |     password: userPassword,
  21  |   });
  22  | });
  23  | 
  24  | async function loginUser(page: Page) {
  25  |   await page.goto('/auth');
  26  |   await page.waitForLoadState('networkidle');
  27  |   await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(userEmail);
  28  |   await page.locator('input[type="password"]').first().fill(userPassword);
  29  |   await page.locator('button[type="submit"]').first().click();
  30  |   await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  31  | }
  32  | 
  33  | test.describe('Courses List', () => {
  34  |   test('courses page loads without error', async ({ page }) => {
  35  |     await loginUser(page);
  36  |     await page.goto('/courses');
  37  |     await page.waitForLoadState('networkidle');
  38  | 
  39  |     expect(page.url()).not.toContain('/auth');
  40  |     await expect(page.locator('text="Something went wrong"')).not.toBeVisible();
  41  |   });
  42  | 
  43  |   test('courses page shows list or empty state', async ({ page }) => {
  44  |     await loginUser(page);
  45  |     await page.goto('/courses');
  46  |     await page.waitForLoadState('networkidle');
  47  | 
  48  |     const content = page.locator(
  49  |       'table, [data-testid="course-list"], [data-testid="empty-state"], .empty-state, text=/no courses/i',
  50  |     ).first();
  51  |     await expect(content).toBeVisible({ timeout: 10_000 });
  52  |   });
  53  | });
  54  | 
  55  | test.describe('Create Course', () => {
  56  |   test('create course button is visible', async ({ page }) => {
  57  |     await loginUser(page);
  58  |     await page.goto('/courses');
  59  |     await page.waitForLoadState('networkidle');
  60  | 
  61  |     const createBtn = page.locator(
  62  |       'button:has-text("Create"), button:has-text("New"), a:has-text("New Course"), [data-testid="create-course"]',
  63  |     ).first();
  64  |     await expect(createBtn).toBeVisible({ timeout: 10_000 });
  65  |   });
  66  | 
  67  |   test('can fill course form and save', async ({ page }) => {
  68  |     await loginUser(page);
  69  |     await page.goto('/courses');
  70  |     await page.waitForLoadState('networkidle');
  71  | 
  72  |     const createBtn = page.locator(
  73  |       'button:has-text("Create"), button:has-text("New"), a:has-text("New Course"), [data-testid="create-course"]',
  74  |     ).first();
  75  | 
  76  |     if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
  77  |       test.skip(true, 'Create course button not visible');
  78  |       return;
  79  |     }
  80  | 
  81  |     await createBtn.click();
  82  |     await page.waitForLoadState('networkidle');
  83  | 
  84  |     const titleInput = page.locator('input[name="title"], input[placeholder*="title" i]').first();
  85  |     if (await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
  86  |       await titleInput.fill(`E2E Course ${Date.now()}`);
  87  | 
  88  |       const descArea = page.locator('textarea[name="description"], [contenteditable="true"], .ql-editor, .ProseMirror').first();
  89  |       if (await descArea.isVisible({ timeout: 3000 }).catch(() => false)) {
  90  |         await descArea.fill('Course description for E2E test.');
  91  |       }
  92  | 
  93  |       const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]').first();
  94  |       await saveBtn.click();
  95  |       await page.waitForTimeout(2000);
  96  |       expect(page.url()).not.toContain('error');
  97  |     }
  98  |   });
  99  | });
  100 | 
  101 | test.describe('Public Course View', () => {
  102 |   test('/public/courses page loads if it exists', async ({ page }) => {
  103 |     await page.goto('/explore/programming');
  104 |     await page.waitForLoadState('networkidle');
  105 |     // Either shows content or 404 — should not crash
  106 |     await expect(page.locator('text="Something went wrong"')).not.toBeVisible();
  107 |   });
  108 | 
  109 |   test('/course/:id shows 404 or redirect for non-existent course', async ({ page }) => {
  110 |     await page.goto('/course/999999');
  111 |     await page.waitForLoadState('networkidle');
  112 |     const notFound = page.locator('text=/not found|404|does not exist/i').first();
  113 |     const isNotFound = await notFound.isVisible({ timeout: 5000 }).catch(() => false);
  114 |     expect(isNotFound || !page.url().includes('999999')).toBe(true);
  115 |   });
  116 | });
  117 | 
```