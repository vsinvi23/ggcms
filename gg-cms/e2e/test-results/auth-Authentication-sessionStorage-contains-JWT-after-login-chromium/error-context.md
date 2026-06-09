# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> Authentication >> sessionStorage contains JWT after login
- Location: specs/auth.spec.ts:124:7

# Error details

```
AxiosError: Request failed with status code 429
```

# Test source

```ts
  29  | 
  30  |     const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  31  |     const passwordInput = page.locator('input[type="password"]').first();
  32  | 
  33  |     await expect(emailInput).toBeVisible();
  34  |     await expect(passwordInput).toBeVisible();
  35  |   });
  36  | 
  37  |   test('invalid credentials shows error message', async ({ page }) => {
  38  |     await page.goto('/auth');
  39  |     await page.waitForLoadState('networkidle');
  40  | 
  41  |     const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  42  |     const passwordInput = page.locator('input[type="password"]').first();
  43  | 
  44  |     await emailInput.fill('nobody@test.local');
  45  |     await passwordInput.fill('wrongpassword');
  46  | 
  47  |     const submitBtn = page.locator('button[type="submit"]').first();
  48  |     await submitBtn.click();
  49  | 
  50  |     // Wait for error message to appear
  51  |     await page.waitForTimeout(2000);
  52  |     const errorMsg = page.locator('[role="alert"], .error, [data-testid*="error"], .toast').first();
  53  |     // URL should still be on auth page (login failed)
  54  |     expect(page.url()).toContain('/auth');
  55  |   });
  56  | 
  57  |   test('valid credentials redirect to dashboard', async ({ page }) => {
  58  |     const ts = Date.now();
  59  |     const email = `e2e_login_${ts}@test.local`;
  60  |     const password = 'LoginE2E@123';
  61  | 
  62  |     // Register via API
  63  |     await axios.post(
  64  |       `${API}/auth/local/register`,
  65  |       {
  66  |         username: `e2e_login_${ts}`,
  67  |         email,
  68  |         password,
  69  |         name: 'E2E Login User',
  70  |       },
  71  |       { headers: authBypassHeaders },
  72  |     );
  73  | 
  74  |     await enableAuthBypass(page);
  75  |     await page.goto('/auth');
  76  |     await page.waitForLoadState('networkidle');
  77  | 
  78  |     const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  79  |     const passwordInput = page.locator('input[type="password"]').first();
  80  | 
  81  |     await emailInput.fill(email);
  82  |     await passwordInput.fill(password);
  83  | 
  84  |     await page.locator('button[type="submit"]').first().click();
  85  | 
  86  |     // Should redirect away from /auth
  87  |     await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  88  |     expect(page.url()).not.toContain('/auth');
  89  |   });
  90  | 
  91  |   test('after login, dashboard is accessible', async ({ page }) => {
  92  |     const ts = Date.now();
  93  |     const email = `e2e_dash_${ts}@test.local`;
  94  |     const password = 'DashE2E@123';
  95  | 
  96  |     await axios.post(
  97  |       `${API}/auth/local/register`,
  98  |       {
  99  |         username: `e2e_dash_${ts}`,
  100 |         email,
  101 |         password,
  102 |         name: 'E2E Dashboard User',
  103 |       },
  104 |       { headers: authBypassHeaders },
  105 |     );
  106 | 
  107 |     await enableAuthBypass(page);
  108 |     await page.goto('/auth');
  109 |     await page.waitForLoadState('networkidle');
  110 | 
  111 |     await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email);
  112 |     await page.locator('input[type="password"]').first().fill(password);
  113 |     await page.locator('button[type="submit"]').first().click();
  114 | 
  115 |     await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  116 | 
  117 |     await page.goto('/dashboard');
  118 |     await page.waitForLoadState('networkidle');
  119 | 
  120 |     // Should stay on dashboard (not redirect to auth)
  121 |     expect(page.url()).not.toContain('/auth');
  122 |   });
  123 | 
  124 |   test('sessionStorage contains JWT after login', async ({ page }) => {
  125 |     const ts = Date.now();
  126 |     const email = `e2e_storage_${ts}@test.local`;
  127 |     const password = 'StorageE2E@123';
  128 | 
> 129 |     await axios.post(
      |     ^ AxiosError: Request failed with status code 429
  130 |       `${API}/auth/local/register`,
  131 |       {
  132 |         username: `e2e_storage_${ts}`,
  133 |         email,
  134 |         password,
  135 |         name: 'E2E Storage User',
  136 |       },
  137 |       { headers: authBypassHeaders },
  138 |     );
  139 | 
  140 |     await enableAuthBypass(page);
  141 |     await page.goto('/auth');
  142 |     await page.waitForLoadState('networkidle');
  143 | 
  144 |     await page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first().fill(email);
  145 |     await page.locator('input[type="password"]').first().fill(password);
  146 |     await page.locator('button[type="submit"]').first().click();
  147 | 
  148 |     await page.waitForURL((url) => !url.pathname.includes('/auth'), { timeout: 15_000 });
  149 | 
  150 |     // Check sessionStorage for JWT
  151 |     const jwt = await page.evaluate(() => {
  152 |       for (let i = 0; i < sessionStorage.length; i++) {
  153 |         const key = sessionStorage.key(i)!;
  154 |         const val = sessionStorage.getItem(key);
  155 |         if (val && val.split('.').length === 3) return val;
  156 |       }
  157 |       return null;
  158 |     });
  159 |     expect(jwt).toBeTruthy();
  160 |   });
  161 | });
  162 | 
```