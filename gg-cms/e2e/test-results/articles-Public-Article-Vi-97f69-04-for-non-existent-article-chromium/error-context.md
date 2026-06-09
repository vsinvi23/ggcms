# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: articles.spec.ts >> Public Article View >> /article/:id shows 404 for non-existent article
- Location: specs/articles.spec.ts:137:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "GeekGully GeekGully" [ref=e6] [cursor=pointer]:
          - /url: /
          - img "GeekGully" [ref=e7]:
            - generic [ref=e14]: ">"
            - generic [ref=e15]: GG
            - generic [ref=e16]: _
          - generic [ref=e17]: GeekGully
        - navigation [ref=e18]:
          - link "Courses" [ref=e19] [cursor=pointer]:
            - /url: /explore/courses
            - img [ref=e20]
            - text: Courses
          - link "Articles" [ref=e22] [cursor=pointer]:
            - /url: /explore/articles
            - img [ref=e23]
            - text: Articles
        - generic [ref=e26]:
          - button "Sign In" [ref=e27] [cursor=pointer]
          - button "Get Started" [ref=e28] [cursor=pointer]
    - main [ref=e29]:
      - generic [ref=e50]:
        - generic [ref=e51]:
          - generic [ref=e52]:
            - generic [ref=e53]:
              - img "GeekGully" [ref=e54]:
                - generic [ref=e61]: ">"
                - generic [ref=e62]: GG
                - generic [ref=e63]: _
              - generic [ref=e64]: GeekGully
            - paragraph [ref=e65]: A learning platform for developers — courses, articles and hands-on content to grow your skills.
          - generic [ref=e66]:
            - paragraph [ref=e67]: Learn
            - list [ref=e68]:
              - listitem [ref=e69]:
                - link "Courses" [ref=e70] [cursor=pointer]:
                  - /url: /explore/courses
              - listitem [ref=e71]:
                - link "Articles" [ref=e72] [cursor=pointer]:
                  - /url: /explore/articles
              - listitem [ref=e73]:
                - link "Course Bytes" [ref=e74] [cursor=pointer]:
                  - /url: /explore/bytes
          - generic [ref=e75]:
            - paragraph [ref=e76]: Discover
            - list [ref=e77]:
              - listitem [ref=e78]:
                - link "Search Content" [ref=e79] [cursor=pointer]:
                  - /url: /search
              - listitem [ref=e80]:
                - link "Browse Courses" [ref=e81] [cursor=pointer]:
                  - /url: /explore/courses
              - listitem [ref=e82]:
                - link "Browse Articles" [ref=e83] [cursor=pointer]:
                  - /url: /explore/articles
          - generic [ref=e84]:
            - paragraph [ref=e85]: My Account
            - list [ref=e86]:
              - listitem [ref=e87]:
                - link "Dashboard" [ref=e88] [cursor=pointer]:
                  - /url: /dashboard
              - listitem [ref=e89]:
                - link "My Learning" [ref=e90] [cursor=pointer]:
                  - /url: /my-learning
              - listitem [ref=e91]:
                - link "Notes & Highlights" [ref=e92] [cursor=pointer]:
                  - /url: /notes-highlights
              - listitem [ref=e93]:
                - link "Settings" [ref=e94] [cursor=pointer]:
                  - /url: /account-settings
        - generic [ref=e96]:
          - generic [ref=e97]: © 2026 GeekGully. All rights reserved.
          - generic [ref=e98]: Built for developers who love to learn.
```

# Test source

```ts
  45  |     await page.goto('/articles');
  46  |     await page.waitForLoadState('networkidle');
  47  | 
  48  |     // Should show either a table/list or empty-state message
  49  |     const articleList = page.locator('table, [data-testid="article-list"], [data-testid="empty-state"], .empty-state').first();
  50  |     const noArticlesText = page.locator('text=/no articles/i').first();
  51  |     const isVisible =
  52  |       (await articleList.isVisible().catch(() => false)) ||
  53  |       (await noArticlesText.isVisible().catch(() => false));
  54  |     expect(isVisible).toBe(true);
  55  |   });
  56  | 
  57  |   test('articles page does not show a network error toast', async ({ page }) => {
  58  |     await loginUser(page);
  59  | 
  60  |     // Listen for console errors that indicate failed API calls
  61  |     const errors: string[] = [];
  62  |     page.on('console', (msg) => {
  63  |       if (msg.type() === 'error') errors.push(msg.text());
  64  |     });
  65  | 
  66  |     await page.goto('/articles');
  67  |     await page.waitForLoadState('networkidle');
  68  |     await page.waitForTimeout(2000);
  69  | 
  70  |     // No uncaught TypeError/NetworkError in console
  71  |     const networkErrors = errors.filter((e) => e.includes('Network') || e.includes('fetch') || e.includes('500'));
  72  |     expect(networkErrors).toHaveLength(0);
  73  |   });
  74  | });
  75  | 
  76  | test.describe('Create Article', () => {
  77  |   test('create article button/link is visible on articles page', async ({ page }) => {
  78  |     await loginUser(page);
  79  |     await page.goto('/articles');
  80  |     await page.waitForLoadState('networkidle');
  81  | 
  82  |     const createBtn = page.locator(
  83  |       'button:has-text("Create"), button:has-text("New"), a:has-text("Create"), a:has-text("New Article"), [data-testid="create-article"]',
  84  |     ).first();
  85  |     await expect(createBtn).toBeVisible({ timeout: 10_000 });
  86  |   });
  87  | 
  88  |   test('can fill article form and submit (creates draft)', async ({ page }) => {
  89  |     await loginUser(page);
  90  |     await page.goto('/articles');
  91  |     await page.waitForLoadState('networkidle');
  92  | 
  93  |     // Click create button
  94  |     const createBtn = page.locator(
  95  |       'button:has-text("Create"), button:has-text("New"), a:has-text("Create"), a:has-text("New Article"), [data-testid="create-article"]',
  96  |     ).first();
  97  | 
  98  |     if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
  99  |       test.skip(true, 'Create button not found — UI may differ');
  100 |       return;
  101 |     }
  102 | 
  103 |     await createBtn.click();
  104 |     await page.waitForLoadState('networkidle');
  105 | 
  106 |     // Fill title
  107 |     const titleInput = page.locator('input[name="title"], input[placeholder*="title" i], textarea[name="title"]').first();
  108 |     if (await titleInput.isVisible({ timeout: 5000 }).catch(() => false)) {
  109 |       await titleInput.fill(`E2E Article ${Date.now()}`);
  110 | 
  111 |       // Fill content (may be a rich text editor or textarea)
  112 |       const contentArea = page.locator('textarea[name="content"], [contenteditable="true"], .ql-editor, .ProseMirror').first();
  113 |       if (await contentArea.isVisible({ timeout: 3000 }).catch(() => false)) {
  114 |         await contentArea.fill('E2E test article content here.');
  115 |       }
  116 | 
  117 |       // Save/submit
  118 |       const saveBtn = page.locator('button:has-text("Save"), button:has-text("Create"), button[type="submit"]').first();
  119 |       await saveBtn.click();
  120 |       await page.waitForTimeout(2000);
  121 | 
  122 |       // Should not be on an error page
  123 |       expect(page.url()).not.toContain('error');
  124 |     }
  125 |   });
  126 | });
  127 | 
  128 | test.describe('Public Article View', () => {
  129 |   test('GET / renders public articles feed', async ({ page }) => {
  130 |     await page.goto('/');
  131 |     await page.waitForLoadState('networkidle');
  132 |     // Home page should render without crash
  133 |     await expect(page.locator('body')).not.toBeEmpty();
  134 |     await expect(page.locator('text="Something went wrong"')).not.toBeVisible();
  135 |   });
  136 | 
  137 |   test('/article/:id shows 404 for non-existent article', async ({ page }) => {
  138 |     const response = await page.goto('/article/999999');
  139 |     await page.waitForLoadState('networkidle');
  140 |     // Either a 404 message or redirect to home
  141 |     const notFound = page.locator('text=/not found|404|does not exist|article not found|unable to find/i').first();
  142 |     const isNotFound = await notFound.isVisible({ timeout: 5000 }).catch(() => false);
  143 |     const statusCode = response?.status();
  144 |     // Acceptable: 404 message, redirect away from the bogus article URL, or a 404 server response
> 145 |     expect(isNotFound || !page.url().includes('999999') || statusCode === 404).toBe(true);
      |                                                                                ^ Error: expect(received).toBe(expected) // Object.is equality
  146 |   });
  147 | });
  148 | 
```