import { test, expect, type Page } from '@playwright/test';
import { moduleTitles } from '../../frontend/src/pages/Preview/data/fixtures';

async function openPreview(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute(
    'data-color-mode',
    /^(light|dark)$/,
  );
}

test('all feature screens render without browser exceptions', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const [module, title] of Object.entries(moduleTitles)) {
    await openPreview(page, `/ui-preview?module=${module}`);
    if (module === 'login')
      await expect(
        page.getByRole('heading', { name: 'Welcome back' }),
      ).toBeVisible();
    else {
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await expect(page.getByText('Sample records only')).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
});

test('search, filter, switch board view and update a ticket', async ({
  page,
}) => {
  await openPreview(page, '/ui-preview?module=tickets');
  await page.getByRole('textbox', { name: 'Search tickets' }).fill('VPN');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page
    .getByRole('combobox', { name: 'Filter priority' })
    .selectOption('Critical');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('button', { name: 'Board view' }).click();
  await expect(page.locator('.spark-board > section')).toHaveCount(5);
  await page.getByRole('button', { name: 'Table view' }).click();
  await page.getByRole('button', { name: /INC-000128 Unable/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('combobox', { name: 'Status', exact: true })
    .selectOption('Resolved');
  await dialog
    .getByRole('textbox', { name: 'Only visible to the service team' })
    .fill('Investigated and confirmed the sample resolution.');
  await dialog.getByRole('button', { name: 'Add note', exact: true }).click();
  await expect(
    dialog.getByText('Investigated and confirmed the sample resolution.'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(
    page
      .locator('tbody tr')
      .filter({ hasText: 'INC-000128' })
      .getByText('Resolved', { exact: true }),
  ).toBeVisible();
});

test('create a ticket and keep it while navigating between modules', async ({
  page,
}) => {
  await openPreview(page, '/ui-preview?module=tickets');
  await page.getByRole('button', { name: 'New ticket', exact: false }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Subject', { exact: true })
    .fill('Preview workflow verification');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('A fictional request to verify the create ticket workflow.');
  await dialog
    .getByRole('button', { name: 'Create ticket', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: /INC-000129 Preview workflow/ }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Dashboard', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'My service desk', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: /All tickets/ })
    .click();
  await expect(
    page.getByText('Preview workflow verification', { exact: true }),
  ).toBeVisible();
});

test('create, edit, and delete a customer sample record', async ({ page }) => {
  await openPreview(page, '/ui-preview?module=clients');
  await page.getByRole('button', { name: 'Add client', exact: false }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Client', { exact: true }).fill('Preview Customer');
  await dialog
    .getByLabel('Primary contact', { exact: true })
    .fill('Preview Contact');
  await dialog.getByLabel('Service plan', { exact: true }).fill('Standard');
  await dialog.getByRole('button', { name: 'Save client' }).click();
  const row = page.locator('tbody tr').filter({ hasText: 'Preview Customer' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await dialog
    .getByLabel('Service plan', { exact: true })
    .fill('Business Plus');
  await dialog.getByRole('button', { name: 'Save client' }).click();
  await expect(row.getByText('Business Plus')).toBeVisible();
  await row.getByRole('button', { name: 'Delete Preview Customer' }).click();
  await dialog.getByRole('button', { name: 'Remove record' }).click();
  await expect(row).toHaveCount(0);
});

test('navigation search, theme, knowledge dialog, and CSV download work', async ({
  page,
}) => {
  await openPreview(page, '/ui-preview');
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog').getByRole('textbox').fill('Knowledge');
  await page
    .getByRole('dialog')
    .getByRole('link', { name: /Knowledge base/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Knowledge base', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Read article', exact: false })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Service performance' })
    .click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export report' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    'astra-service-performance-sample.csv',
  );
});

test('desktop, mobile, and login layouts remain within the viewport', async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await openPreview(page, '/ui-preview');
    await expect(
      page.getByRole('heading', { name: 'My service desk', exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/ui/dashboard-${viewport.width}.png`,
      fullPage: true,
    });
    if (viewport.width < 700) {
      await page.getByRole('button', { name: 'Toggle navigation' }).click();
      await page
        .getByRole('navigation')
        .getByRole('link', { name: /All tickets/ })
        .click();
      await expect(
        page.getByRole('heading', { name: 'All tickets', exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: 'artifacts/ui/tickets-mobile.png',
        fullPage: true,
      });
    }
    await openPreview(page, '/ui-preview?module=login');
    await expect(
      page.getByRole('heading', { name: 'Welcome back' }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/ui/login-${viewport.width}.png`,
      fullPage: true,
    });
  }
});
