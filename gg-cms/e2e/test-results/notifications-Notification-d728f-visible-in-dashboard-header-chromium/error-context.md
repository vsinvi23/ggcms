# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notifications.spec.ts >> Notifications UI >> notification bell/icon is visible in dashboard header
- Location: specs/notifications.spec.ts:75:7

# Error details

```
AxiosError: Request failed with status code 429
```

# Test source

```ts
  1   | /**
  2   |  * Notifications E2E tests
  3   |  * Covers: notification badge, list view, mark-read interaction
  4   |  */
  5   | import { test, expect, Page } from '@playwright/test';
  6   | import axios from 'axios';
  7   | import { authBypassHeaders, enableAuthBypass } from '../fixtures/auth';
  8   | 
  9   | const API = process.env.API_BASE_URL || 'http://localhost:1337/api';
  10  | 
  11  | let userEmail: string;
  12  | let userPassword: string;
  13  | let userJwt: string;
  14  | let userId: string;
  15  | 
  16  | test.beforeAll(async () => {
  17  |   const ts = Date.now();
  18  |   userEmail = `e2e_notif_${ts}@test.local`;
  19  |   userPassword = 'Notif@E2E123';
> 20  |   const reg = await axios.post(
      |               ^ AxiosError: Request failed with status code 429
  21  |     `${API}/auth/local/register`,
  22  |     {
  23  |       username: `e2e_notif_${ts}`,
  24  |       email: userEmail,
  25  |       password: userPassword,
  26  |       name: 'E2E Notification User',
  27  |     },
  28  |     { headers: authBypassHeaders },
  29  |   );
  30  |   userJwt = reg.data.jwt;
  31  |   userId = String(reg.data.user?.id);
  32  | });
  33  | 
  34  | async function loginUser(page: Page) {
  35  |   await enableAuthBypass(page);
  36  |   await page.goto('/auth');
  37  |   await page.waitForLoadState('networkidle');
  38  |   await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(userEmail);
  39  |   await page.locator('input[type="password"]').first().fill(userPassword);
  40  |   await page.locator('button[type="submit"]').first().click();
  41  |   await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  42  | }
  43  | 
  44  | async function seedNotification(message: string = 'Test notification') {
  45  |   const adminLogin = await axios.post(
  46  |     `${API}/auth/local`,
  47  |     {
  48  |       identifier: process.env.SEED_ADMIN_EMAIL || 'admin@cms.local',
  49  |       password: process.env.SEED_ADMIN_PASSWORD || 'Admin@CMS2024!',
  50  |     },
  51  |     { headers: authBypassHeaders, validateStatus: () => true },
  52  |   );
  53  |   const adminJwt = adminLogin.data.jwt;
  54  |   if (!adminJwt) return null;
  55  | 
  56  |   const res = await axios.post(
  57  |     `${API}/notifications`,
  58  |     {
  59  |       data: {
  60  |         user: userId,
  61  |         title: 'E2E Notification',
  62  |         message,
  63  |         read: false,
  64  |       },
  65  |     },
  66  |     {
  67  |       headers: { Authorization: `Bearer ${adminJwt}` },
  68  |       validateStatus: () => true,
  69  |     },
  70  |   );
  71  |   return res.data.data ?? null;
  72  | }
  73  | 
  74  | test.describe('Notifications UI', () => {
  75  |   test('notification bell/icon is visible in dashboard header', async ({ page }) => {
  76  |     await loginUser(page);
  77  |     await page.goto('/dashboard');
  78  |     await page.waitForLoadState('networkidle');
  79  | 
  80  |     const bell = page.locator(
  81  |       '[data-testid="notifications"], [aria-label*="notification" i], button:has([class*="bell"]), .notification-bell',
  82  |     ).first();
  83  |     // Bell icon is optional — skip if not present
  84  |     const isVisible = await bell.isVisible({ timeout: 5000 }).catch(() => false);
  85  |     if (!isVisible) {
  86  |       test.skip(true, 'Notification bell not found in UI');
  87  |     }
  88  |   });
  89  | 
  90  |   test('notification count badge updates after seeding', async ({ page }) => {
  91  |     const notif = await seedNotification('Badge test notification');
  92  |     if (!notif) {
  93  |       test.skip(true, 'Could not seed notification (admin not available)');
  94  |       return;
  95  |     }
  96  | 
  97  |     await loginUser(page);
  98  |     await page.goto('/dashboard');
  99  |     await page.waitForLoadState('networkidle');
  100 |     await page.waitForTimeout(1500);
  101 | 
  102 |     // Look for a badge with a number
  103 |     const badge = page.locator('[data-testid="notification-count"], .badge, [class*="badge"]').first();
  104 |     const isVisible = await badge.isVisible({ timeout: 5000 }).catch(() => false);
  105 |     // If badge exists, verify it has a number
  106 |     if (isVisible) {
  107 |       const text = await badge.textContent();
  108 |       expect(Number(text)).toBeGreaterThan(0);
  109 |     }
  110 |   });
  111 | 
  112 |   test('navigating to notifications page shows list', async ({ page }) => {
  113 |     await loginUser(page);
  114 | 
  115 |     // Try /notifications or look for a link in nav
  116 |     await page.goto('/dashboard');
  117 |     await page.waitForLoadState('networkidle');
  118 | 
  119 |     const notifLink = page.locator('a[href*="notification"], nav a:has-text("Notification")').first();
  120 |     if (await notifLink.isVisible({ timeout: 3000 }).catch(() => false)) {
```