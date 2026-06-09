import { test, expect } from '@playwright/test';
import { injectFakeSession } from './helpers/auth';

test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, true);
    await page.goto('/users');
  });

  test('loads the user management page', async ({ page }) => {
    await expect(page).toHaveURL(/\/users/);
  });

  test('does not redirect authenticated admin to /auth', async ({ page }) => {
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test('renders a user table or empty state', async ({ page }) => {
    const userList = page.locator('table, [role=grid]')
      .or(page.getByText(/No users/i))
      .or(page.getByText(/no results/i));
    await expect(userList.first()).toBeVisible({ timeout: 10_000 });
  });

  test('has an Invite User button', async ({ page }) => {
    const inviteBtn = page.getByRole('button', { name: /invite user|invite/i });
    await expect(inviteBtn.first()).toBeVisible();
  });

  test('has a search / filter input', async ({ page }) => {
    const searchInput = page.locator('input[type=search], input[placeholder*="Search"], input[placeholder*="search"]');
    await expect(searchInput.first()).toBeVisible({ timeout: 5_000 });
  });
});

test.describe('User Management Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, true);
    await page.goto('/user-management');
  });

  test('loads /user-management page', async ({ page }) => {
    await expect(page).toHaveURL(/\/user-management/);
  });
});

test.describe('User Management — unauthenticated', () => {
  test('redirects /users to /auth', async ({ page }) => {
    await page.goto('/users');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('redirects /user-management to /auth', async ({ page }) => {
    await page.goto('/user-management');
    await expect(page).toHaveURL(/\/auth/);
  });
});

test.describe('Roles / Groups page', () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page, true);
    await page.goto('/roles');
  });

  test('loads /roles page', async ({ page }) => {
    await expect(page).toHaveURL(/\/roles/);
  });

  test('/groups redirects to /roles', async ({ page }) => {
    await page.goto('/groups');
    await expect(page).toHaveURL(/\/roles/);
  });

  test('has a create role or group button', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: /create|new|add group|add role/i });
    await expect(createBtn.first()).toBeVisible({ timeout: 8_000 });
  });
});
