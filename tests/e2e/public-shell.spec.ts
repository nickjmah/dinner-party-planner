import { expect, test } from '@playwright/test';

test('owner login is responsive and public signup is absent', async ({ page }) => {
  await page.goto('#/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Public signup is disabled.')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign up/i })).toHaveCount(0);
});

test('guest route prompts for the scoped dinner code', async ({ page }) => {
  await page.goto('#/d/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  await expect(page.getByRole('heading', { name: 'Open the dinner plan' })).toBeVisible();
  await expect(page.getByLabel('Dinner code')).toHaveAttribute('maxlength', '8');
});

