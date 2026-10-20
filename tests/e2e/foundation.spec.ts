import { test, expect } from '@playwright/test';
test('identity setup remains closed until Entra is configured', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Identity setup is required.' }),
  ).toBeVisible();
  await expect(
    page.getByText('Your organisation manages access to this workspace.'),
  ).toBeVisible();
  expect((await request.get('/health')).status()).toBe(200);
  expect((await request.get('/api/auth/status')).status()).toBe(200);
  expect((await request.get('/api/clients')).status()).toBe(401);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
