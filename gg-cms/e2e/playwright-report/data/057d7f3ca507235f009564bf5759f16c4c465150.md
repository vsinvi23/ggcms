# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication >> after login, dashboard is accessible
- Location: specs\auth.spec.ts:84:7

# Error details

```
Error: read ECONNRESET
```

# Test source

```ts
  1   | /**
  2   |  * E2E Auth tests
  3   |  * Covers: registration, login, logout, protected route redirect, invalid credentials
  4   |  */
  5   | import { test, expect } from '@playwright/test';
  6   | import axios from 'axios';
  7   | 
  8   | const API = process.env.API_BASE_URL || 'http://localhost:1337/api';
  9   | 
  10  | test.describe('Authentication', () => {
  11  |   test('home page loads without auth', async ({ page }) => {
  12  |     await page.goto('/');
  13  |     await page.waitForLoadState('networkidle');
  14  |     expect(page.url()).toBeTruthy();
  15  |     // Should not redirect to auth for public home
  16  |     await expect(page).not.toHaveURL(/\/auth/);
  17  |   });
  18  | 
  19  |   test('accessing /dashboard redirects to /auth when not logged in', async ({ page }) => {
  20  |     await page.goto('/dashboard');
  21  |     await page.waitForURL('**/auth**', { timeout: 10_000 });
  22  |     expect(page.url()).toContain('/auth');
  23  |   });
  24  | 
  25  |   test('login page renders email and password fields', async ({ page }) => {
  26  |     await page.goto('/auth');
  27  |     await page.waitForLoadState('networkidle');
  28  | 
  29  |     const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  30  |     const passwordInput = page.locator('input[type="password"]').first();
  31  | 
  32  |     await expect(emailInput).toBeVisible();
  33  |     await expect(passwordInput).toBeVisible();
  34  |   });
  35  | 
  36  |   test('invalid credentials shows error message', async ({ page }) => {
  37  |     await page.goto('/auth');
  38  |     await page.waitForLoadState('networkidle');
  39  | 
  40  |     const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  41  |     const passwordInput = page.locator('input[type="password"]').first();
  42  | 
  43  |     await emailInput.fill('nobody@test.local');
  44  |     await passwordInput.fill('wrongpassword');
  45  | 
  46  |     const submitBtn = page.locator('button[type="submit"]').first();
  47  |     await submitBtn.click();
  48  | 
  49  |     // Wait for error message to appear
  50  |     await page.waitForTimeout(2000);
  51  |     const errorMsg = page.locator('[role="alert"], .error, [data-testid*="error"], .toast').first();
  52  |     // URL should still be on auth page (login failed)
  53  |     expect(page.url()).toContain('/auth');
  54  |   });
  55  | 
  56  |   test('valid credentials redirect to dashboard', async ({ page }) => {
  57  |     const ts = Date.now();
  58  |     const email = `e2e_login_${ts}@test.local`;
  59  |     const password = 'LoginE2E@123';
  60  | 
  61  |     // Register via API
  62  |     await axios.post(`${API}/auth/local/register`, {
  63  |       username: `e2e_login_${ts}`,
  64  |       email,
  65  |       password,
  66  |     });
  67  | 
  68  |     await page.goto('/auth');
  69  |     await page.waitForLoadState('networkidle');
  70  | 
  71  |     const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  72  |     const passwordInput = page.locator('input[type="password"]').first();
  73  | 
  74  |     await emailInput.fill(email);
  75  |     await passwordInput.fill(password);
  76  | 
  77  |     await page.locator('button[type="submit"]').first().click();
  78  | 
  79  |     // Should redirect away from /auth
  80  |     await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  81  |     expect(page.url()).not.toContain('/auth');
  82  |   });
  83  | 
  84  |   test('after login, dashboard is accessible', async ({ page }) => {
  85  |     const ts = Date.now();
  86  |     const email = `e2e_dash_${ts}@test.local`;
  87  |     const password = 'DashE2E@123';
  88  | 
> 89  |     await axios.post(`${API}/auth/local/register`, { username: `e2e_dash_${ts}`, email, password });
      |     ^ Error: read ECONNRESET
  90  | 
  91  |     await page.goto('/auth');
  92  |     await page.waitForLoadState('networkidle');
  93  | 
  94  |     await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email);
  95  |     await page.locator('input[type="password"]').first().fill(password);
  96  |     await page.locator('button[type="submit"]').first().click();
  97  | 
  98  |     await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  99  | 
  100 |     await page.goto('/dashboard');
  101 |     await page.waitForLoadState('networkidle');
  102 | 
  103 |     // Should stay on dashboard (not redirect to auth)
  104 |     expect(page.url()).not.toContain('/auth');
  105 |   });
  106 | 
  107 |   test('sessionStorage contains JWT after login', async ({ page }) => {
  108 |     const ts = Date.now();
  109 |     const email = `e2e_storage_${ts}@test.local`;
  110 |     const password = 'StorageE2E@123';
  111 | 
  112 |     await axios.post(`${API}/auth/local/register`, { username: `e2e_storage_${ts}`, email, password });
  113 | 
  114 |     await page.goto('/auth');
  115 |     await page.waitForLoadState('networkidle');
  116 | 
  117 |     await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email);
  118 |     await page.locator('input[type="password"]').first().fill(password);
  119 |     await page.locator('button[type="submit"]').first().click();
  120 | 
  121 |     await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  122 | 
  123 |     // Check sessionStorage for JWT
  124 |     const jwt = await page.evaluate(() => {
  125 |       for (let i = 0; i < sessionStorage.length; i++) {
  126 |         const key = sessionStorage.key(i)!;
  127 |         const val = sessionStorage.getItem(key);
  128 |         if (val && val.split('.').length === 3) return val;
  129 |       }
  130 |       return null;
  131 |     });
  132 |     expect(jwt).toBeTruthy();
  133 |   });
  134 | });
  135 | 
```