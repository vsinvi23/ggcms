# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: notifications.spec.ts >> Notifications UI >> notification bell/icon is visible in dashboard header
- Location: specs\notifications.spec.ts:68:7

# Error details

```
Error: read ECONNRESET
```

# Test source

```ts
  1   | /**
  2   |  * Notifications E2E tests
  3   |  * Covers: notification badge, list view, mark-read interaction
  4   |  */
  5   | import { test, expect, Page } from '@playwright/test';
  6   | import axios from 'axios';
  7   | 
  8   | const API = process.env.API_BASE_URL || 'http://localhost:1337/api';
  9   | 
  10  | let userEmail: string;
  11  | let userPassword: string;
  12  | let userJwt: string;
  13  | let userId: string;
  14  | 
  15  | test.beforeAll(async () => {
  16  |   const ts = Date.now();
  17  |   userEmail = `e2e_notif_${ts}@test.local`;
  18  |   userPassword = 'Notif@E2E123';
> 19  |   const reg = await axios.post(`${API}/auth/local/register`, {
      |               ^ Error: read ECONNRESET
  20  |     username: `e2e_notif_${ts}`,
  21  |     email: userEmail,
  22  |     password: userPassword,
  23  |   });
  24  |   userJwt = reg.data.jwt;
  25  |   userId = String(reg.data.user?.id);
  26  | });
  27  | 
  28  | async function loginUser(page: Page) {
  29  |   await page.goto('/auth');
  30  |   await page.waitForLoadState('networkidle');
  31  |   await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(userEmail);
  32  |   await page.locator('input[type="password"]').first().fill(userPassword);
  33  |   await page.locator('button[type="submit"]').first().click();
  34  |   await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  35  | }
  36  | 
  37  | async function seedNotification(message: string = 'Test notification') {
  38  |   const adminLogin = await axios.post(
  39  |     `${API}/auth/local`,
  40  |     {
  41  |       identifier: process.env.SEED_ADMIN_EMAIL || 'admin@cms.local',
  42  |       password: process.env.SEED_ADMIN_PASSWORD || 'Admin@CMS2024!',
  43  |     },
  44  |     { validateStatus: () => true },
  45  |   );
  46  |   const adminJwt = adminLogin.data.jwt;
  47  |   if (!adminJwt) return null;
  48  | 
  49  |   const res = await axios.post(
  50  |     `${API}/notifications`,
  51  |     {
  52  |       data: {
  53  |         user: userId,
  54  |         title: 'E2E Notification',
  55  |         message,
  56  |         read: false,
  57  |       },
  58  |     },
  59  |     {
  60  |       headers: { Authorization: `Bearer ${adminJwt}` },
  61  |       validateStatus: () => true,
  62  |     },
  63  |   );
  64  |   return res.data.data ?? null;
  65  | }
  66  | 
  67  | test.describe('Notifications UI', () => {
  68  |   test('notification bell/icon is visible in dashboard header', async ({ page }) => {
  69  |     await loginUser(page);
  70  |     await page.goto('/dashboard');
  71  |     await page.waitForLoadState('networkidle');
  72  | 
  73  |     const bell = page.locator(
  74  |       '[data-testid="notifications"], [aria-label*="notification" i], button:has([class*="bell"]), .notification-bell',
  75  |     ).first();
  76  |     // Bell icon is optional — skip if not present
  77  |     const isVisible = await bell.isVisible({ timeout: 5000 }).catch(() => false);
  78  |     if (!isVisible) {
  79  |       test.skip(true, 'Notification bell not found in UI');
  80  |     }
  81  |   });
  82  | 
  83  |   test('notification count badge updates after seeding', async ({ page }) => {
  84  |     const notif = await seedNotification('Badge test notification');
  85  |     if (!notif) {
  86  |       test.skip(true, 'Could not seed notification (admin not available)');
  87  |       return;
  88  |     }
  89  | 
  90  |     await loginUser(page);
  91  |     await page.goto('/dashboard');
  92  |     await page.waitForLoadState('networkidle');
  93  |     await page.waitForTimeout(1500);
  94  | 
  95  |     // Look for a badge with a number
  96  |     const badge = page.locator('[data-testid="notification-count"], .badge, [class*="badge"]').first();
  97  |     const isVisible = await badge.isVisible({ timeout: 5000 }).catch(() => false);
  98  |     // If badge exists, verify it has a number
  99  |     if (isVisible) {
  100 |       const text = await badge.textContent();
  101 |       expect(Number(text)).toBeGreaterThan(0);
  102 |     }
  103 |   });
  104 | 
  105 |   test('navigating to notifications page shows list', async ({ page }) => {
  106 |     await loginUser(page);
  107 | 
  108 |     // Try /notifications or look for a link in nav
  109 |     await page.goto('/dashboard');
  110 |     await page.waitForLoadState('networkidle');
  111 | 
  112 |     const notifLink = page.locator('a[href*="notification"], nav a:has-text("Notification")').first();
  113 |     if (await notifLink.isVisible({ timeout: 3000 }).catch(() => false)) {
  114 |       await notifLink.click();
  115 |     } else {
  116 |       await page.goto('/dashboard'); // fallback: notifications may be in dashboard
  117 |     }
  118 | 
  119 |     await page.waitForLoadState('networkidle');
```