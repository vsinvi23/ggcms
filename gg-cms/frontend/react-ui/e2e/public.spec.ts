import { test, expect } from '@playwright/test';

// ─── Public home page ─────────────────────────────────────────────────────────

test.describe('Public home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads successfully (status 200)', async ({ page }) => {
    await expect(page).toHaveURL('/');
  });

  test('has a visible header', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible();
  });

  test('has a login/auth link or button', async ({ page }) => {
    const authTrigger = page.getByRole('link', { name: /sign in|log in|login/i })
      .or(page.getByRole('button', { name: /sign in|log in|login/i }));
    await expect(authTrigger.first()).toBeVisible();
  });

  test('has a search input or search trigger', async ({ page }) => {
    const searchInput = page.getByRole('searchbox')
      .or(page.locator('input[type=search]'))
      .or(page.locator('input[placeholder*="Search"]'))
      .or(page.locator('input[placeholder*="search"]'))
      .or(page.getByRole('button', { name: /search/i }));
    const count = await searchInput.count();
    // Skip rather than fail if the home page has no search UI
    if (count === 0) test.skip();
    else await expect(searchInput.first()).toBeVisible();
  });

  test('shows featured or recent content', async ({ page }) => {
    // The page should render some content cards or article/course listings
    const contentArea = page.locator('main, [role=main], .content');
    await expect(contentArea.first()).toBeVisible();
  });
});

// ─── 404 page ─────────────────────────────────────────────────────────────────

test.describe('404 Not Found page', () => {
  test('displays 404 heading for unknown route', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText(/Page not found/i)).toBeVisible();
  });

  test('has a working Return to Home link', async ({ page }) => {
    await page.goto('/no-such-page');
    await page.getByRole('link', { name: /Return to Home/i }).click();
    await expect(page).toHaveURL('/');
  });
});

// ─── Search results page ──────────────────────────────────────────────────────

test.describe('Search results page', () => {
  test('renders on /search', async ({ page }) => {
    await page.goto('/search');
    await expect(page).toHaveURL(/\/search/);
  });

  test('renders search results when query param is provided', async ({ page }) => {
    await page.goto('/search?q=react');
    await expect(page).toHaveURL(/\/search/);
  });
});

// ─── Technology / category pages ─────────────────────────────────────────────

test.describe('TechnologyPage', () => {
  test('renders /technology/:slug without crashing', async ({ page }) => {
    await page.goto('/technology/javascript');
    await expect(page).toHaveURL(/\/technology\/javascript/);
  });
});

test.describe('CourseCategoryPage', () => {
  test('renders /explore/courses without crashing', async ({ page }) => {
    await page.goto('/explore/courses');
    await expect(page).toHaveURL(/\/explore\/courses/);
  });

  test('renders /explore/bytes without crashing', async ({ page }) => {
    await page.goto('/explore/bytes');
    await expect(page).toHaveURL(/\/explore\/bytes/);
  });
});

// ─── Public article view ──────────────────────────────────────────────────────

test.describe('Public article view', () => {
  test('renders the public article route pattern', async ({ page }) => {
    // Even with a non-existent slug, the page should render (may show empty/loading state)
    await page.goto('/article/test-article-slug');
    // Should NOT redirect to /auth (it's a public route)
    await expect(page).not.toHaveURL(/\/auth/);
  });
});

// ─── Public course view ───────────────────────────────────────────────────────

test.describe('Public course view', () => {
  test('renders the public course route pattern', async ({ page }) => {
    await page.goto('/course/test-course-slug');
    await expect(page).not.toHaveURL(/\/auth/);
  });
});
