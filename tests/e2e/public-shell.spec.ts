import { expect, test } from '@playwright/test';

test('owner login is responsive and public signup is absent', async ({ page }) => {
  await page.goto('#/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('New collaborators create an account from a dinner-specific editor invite.')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign up/i })).toHaveCount(0);
});

test('editor invite offers sign-in and invite-scoped account creation', async ({ page }) => {
  await page.goto('#/join/example-editor-token');
  await expect(page.getByRole('heading', { name: 'Join the planning table' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
});

test('guest route prompts for the scoped dinner code', async ({ page }) => {
  await page.goto('#/d/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await expect(page.getByRole('heading', { name: 'Open the dinner plan' })).toBeVisible();
  await expect(page.getByLabel('Dinner code')).toHaveAttribute('maxlength', '8');
});

