import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, true);
    await page.goto('/dashboard');
  });

  test('loads the dashboard page (admin session)', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('renders the Admin Dashboard heading', async ({ page }) => {
    await expect(page.getByText('Admin Dashboard')).toBeVisible();
  });

  test('renders the user stats grid', async ({ page }) => {
    await expect(page.getByText('Total Users')).toBeVisible();
    await expect(page.getByText('Active Users')).toBeVisible();
    await expect(page.getByText('Deactivated')).toBeVisible();
    await expect(page.getByText('Pending Invites')).toBeVisible();
  });

  test('renders Quick Actions section', async ({ page }) => {
    await expect(page.getByText('Quick Actions')).toBeVisible();
  });

  test('Manage Users quick action links to /users', async ({ page }) => {
    const manageUsersLink = page.getByRole('link', { name: /Manage Users/i });
    await expect(manageUsersLink).toBeVisible();
    await manageUsersLink.click();
    await expect(page).toHaveURL(/\/users/);
  });

  test('sidebar navigation is present', async ({ page }) => {
    const sidebar = page.locator('[data-testid="app-sidebar"], nav, aside').first();
    await expect(sidebar).toBeVisible();
  });
});

test.describe('Dashboard — unauthenticated', () => {
  test('redirects to /auth when not logged in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth/);
  });
});
