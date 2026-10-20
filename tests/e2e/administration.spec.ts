import { test, expect } from '@playwright/test';
const id = '10000000-0000-4000-8000-000000000001';
const client = '20000000-0000-4000-8000-000000000002';
const ticket = '30000000-0000-4000-8000-000000000003';
// Browser fixtures test presentation and request contracts, not live Entra or SQL.
test.beforeEach(async ({ page }) => {
  let notificationsRead = false;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path === '/api/auth/me')
      body = {
        csrfToken: 'test-csrf',
        user: { id, displayName: 'Lab Administrator', roles: ['ADMIN'] },
      };
    else if (path === '/api/auth/status') body = { configured: true };
    else if (path === '/api/admin/overview')
      body = { users: 1, clients: 1, sites: 0, assets: 0 };
    else if (path === '/api/tickets/dashboard')
      body = {
        counts: {
          open: 1,
          new: 1,
          in_progress: 0,
          waiting: 0,
          recently_resolved: 0,
          pending_approval: 0,
          sla_at_risk: 0,
          sla_breached: 0,
        },
        recent: [],
        charts: { status: [], priority: [], trend: [], source: [] },
      };
    else if (path === '/api/admin/clients')
      body = {
        items: [{ id: client, name: 'Example Client', status: 'ACTIVE' }],
        total: 1,
        page: 1,
        pageSize: 20,
      };
    else if (path === '/api/admin/users')
      body = {
        items: [
          {
            id,
            name: 'Lab Administrator',
            email: 'admin@example.invalid',
            active: true,
            roles: ['ADMIN'],
            client_ids: [],
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      };
    else if (path === '/api/admin/audit-logs')
      body = { items: [], total: 0, page: 1, pageSize: 20 };
    else if (
      path === '/api/notifications' &&
      route.request().method() === 'GET'
    )
      body = {
        unread: notificationsRead ? 0 : 1,
        items: [
          {
            id: '40000000-0000-4000-8000-000000000004',
            ticket_id: ticket,
            ticket_number: 'INC-000002',
            type: 'SLA_BREACHED',
            title: 'INC-000002 breached its resolution SLA',
            body: 'Outlook App Error',
            read_at: notificationsRead ? '2026-09-20T12:16:00.000Z' : undefined,
            created_at: '2026-09-20T12:15:00.000Z',
          },
        ],
      };
    else if (
      path === '/api/notifications/read-all' &&
      route.request().method() === 'PATCH'
    ) {
      expect(route.request().headers()['content-type']).toBeUndefined();
      expect(route.request().postData()).toBeNull();
      notificationsRead = true;
      body = { read: true };
    } else if (path.endsWith('/read') && route.request().method() === 'PATCH')
      return route.fulfill({
        status: 500,
        json: { error: { message: 'Temporary read-state failure.' } },
      });
    else if (path === '/api/users/resolve')
      body = {
        id,
        displayName: 'Verified User',
        email: 'verified@example.invalid',
        userPrincipalName: 'verified@example.invalid',
      };
    else if (path === '/api/users')
      return route.fulfill({
        status: 409,
        json: { error: { message: 'This record already exists.' } },
      });
    else body = { items: [], total: 0, page: 1, pageSize: 20 };
    await route.fulfill({ json: body });
  });
});
test('overview uses real response counts, has navigation and fits 1080p and mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Administration overview' }),
  ).toBeVisible();
  await expect(page.locator('.stats')).toContainText('1');
  await expect(page.getByText('No audit events found.')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'test-results/admin-1080p.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect(
    page.getByRole('navigation', { name: 'Administration' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole('link', { name: 'Users & Access', exact: false })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Users & Access', exact: true }),
  ).toBeVisible();
});
test('notification opens its ticket even when mark-read fails', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: '1 unread notifications' }).click();
  await page
    .getByRole('link', {
      name: /INC-000002 breached its resolution SLA/,
    })
    .click();
  await expect(page).toHaveURL(`/admin/ticket/${ticket}`);
});
test('mark all read sends a valid empty-body request and clears the badge', async ({
  page,
}) => {
  await page.goto('/admin');
  await page.getByRole('button', { name: '1 unread notifications' }).click();
  await page.getByRole('button', { name: 'Mark all read' }).click();
  await expect(
    page.getByRole('button', { name: '0 unread notifications' }),
  ).toBeVisible();
});
test('workspace remains usable when reduced motion is requested', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/admin');
  await expect(
    page.getByRole('heading', { name: 'Administration overview' }),
  ).toBeVisible();
  expect(
    await page
      .locator('main')
      .evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).animationDuration),
      ),
  ).toBeLessThanOrEqual(0.001);
});
test('failed provisioning retains verified identity and role choice; changed input invalidates match', async ({
  page,
}) => {
  await page.goto('/admin/users');
  await page.getByRole('button', { name: '+ Add user' }).click();
  await page
    .getByLabel('Work email or Entra UPN')
    .fill('verified@example.invalid');
  await page.getByRole('button', { name: 'Find in Azure' }).click();
  await expect(page.getByText('Verified User')).toBeVisible();
  await page.getByRole('checkbox', { name: 'USER', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'TECHNICIAN', exact: true }).check();
  await page.getByRole('button', { name: 'Add verified user' }).click();
  await expect(page.getByRole('alert')).toContainText('already exists');
  await expect(page.getByText('Verified User')).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'TECHNICIAN', exact: true }),
  ).toBeChecked();
  await page
    .getByLabel('Work email or Entra UPN')
    .fill('different@example.invalid');
  await expect(
    page.getByRole('button', { name: 'Add verified user' }),
  ).toBeDisabled();
});
test('edit exposes account status and session revocation notice', async ({
  page,
}) => {
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Edit Lab Administrator' }).click();
  await expect(
    page.getByText('Saving access changes signs this user out', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.locator('select[name="active"]')).toHaveValue('true');
});
test('signed-out login has one Microsoft action and no password form', async ({
  page,
}) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 401,
      json: { error: { message: 'Unauthorized' } },
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: 'Sign in with Microsoft' }),
  ).toHaveCount(1);
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.screenshot({
    path: 'test-results/login-1080p.png',
    fullPage: true,
  });
});
test('common sign-in routes an administrator through explicit workspaces', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Choose your workspace' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Technician workspace/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Management workspace/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Administration/ }),
  ).toBeVisible();
});
test('technician navigation stays compact and every statistic has an icon', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/operations');
  const links = page
    .getByRole('navigation', {
      name: 'Technician Portal navigation',
    })
    .getByRole('link');
  await expect(links).toHaveCount(3);
  const first = await links.first().boundingBox();
  const last = await links.last().boundingBox();
  expect(first).not.toBeNull();
  expect(last).not.toBeNull();
  expect(last!.y - first!.y).toBeLessThan(180);
  const icons = page.locator('.ticket-stat .stat-icon');
  await expect(icons).toHaveCount(7);
  expect(
    await icons.evaluateAll((items) =>
      items.every((item) => Boolean(item.textContent?.trim())),
    ),
  ).toBe(true);
});
test('short mobile navigation scrolls while workspace controls remain reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 560 });
  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  const navigation = page.getByRole('navigation', { name: 'Administration' });
  await expect(navigation).toBeVisible();
  expect(
    await navigation.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await expect(
    page.getByRole('link', { name: 'Switch workspace' }).last(),
  ).toBeVisible();
});
test('sidebar keeps lower selected modules in view across navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 550 });
  await page.goto('/admin/users');
  const nav = page.getByRole('navigation', { name: 'Administration' });
  const link = nav.getByRole('link', { name: 'Email administration' });
  await link.click();
  await expect(page).toHaveURL(/\/admin\/email$/);
  const current = page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('link', { name: 'Email administration' });
  await expect(current).toHaveAttribute('aria-current', 'page');
  await expect(current).toBeInViewport();
});
test('expired session hides administration records', async ({ page }) => {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 401,
      json: { error: { message: 'Unauthorized' } },
    }),
  );
  await page.goto('/admin/users');
  await expect(page.getByRole('alert')).toContainText('Sign in');
  await expect(page.getByRole('button', { name: '+ Add user' })).toHaveCount(0);
});
