import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
Object.assign(process.env, {
  DATABASE_URL: 'postgresql://test:secret@127.0.0.1:1/test',
  REDIS_URL: 'redis://127.0.0.1:1',
  APP_BASE_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
  ENTRA_CLIENT_ID: '',
  ENTRA_CLIENT_SECRET: '',
  ENTRA_TENANT_ID: '',
  INITIAL_ADMIN_OBJECT_IDS: '',
});
test('real HTTP admin routes reject anonymous reads and writes before database access', async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    for (const resource of [
      'overview',
      'users',
      'clients',
      'contacts',
      'sites',
      'assets',
      'categories',
      'tags',
      'audit-logs',
      'groups',
      'groups/options',
    ])
      assert.equal((await fetch(`${base}/admin/${resource}`)).status, 401);
    for (const path of [
      '/tickets',
      '/tickets/options',
      '/tickets/10000000-0000-4000-8000-000000000001',
    ])
      assert.equal((await fetch(`${base}${path}`)).status, 401);
    const denied = await fetch(
      `${base}/admin/users/10000000-0000-4000-8000-000000000001`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          origin: 'http://localhost:3000',
        },
        body: JSON.stringify({ roles: ['ADMIN'], clientIds: [], active: true }),
      },
    );
    assert.equal(denied.status, 401);
    const forgedOrigin = await fetch(
      `${base}/admin/clients/10000000-0000-4000-8000-000000000001`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          origin: 'http://untrusted.invalid',
        },
        body: JSON.stringify({ name: 'Test', active: true }),
      },
    );
    assert.equal(forgedOrigin.status, 403);
    const forgedTicket = await fetch(`${base}/tickets`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://untrusted.invalid',
      },
      body: JSON.stringify({
        clientId: '10000000-0000-4000-8000-000000000001',
        requesterId: '20000000-0000-4000-8000-000000000001',
        categoryId: '30000000-0000-4000-8000-000000000001',
        subject: 'Test ticket',
        description: 'Valid shape for CSRF rejection testing',
        source: 'PHONE_CALL',
        priority: 'P3_MEDIUM',
        tagIds: [],
      }),
    });
    assert.equal(forgedTicket.status, 403);
  } finally {
    await app.close();
  }
});
test('callback error redirects to a fixed readable sign-in route without reflecting input', async () => {
  const app = await createApp();
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(
      `${await app.getUrl()}/auth/callback?error_description=private-value`,
      { redirect: 'manual' },
    );
    assert.equal(response.status, 303);
    assert.match(
      response.headers.get('location') ?? '',
      /^\/\?signin=expired&reference=[a-f0-9-]+$/,
    );
    assert.ok(
      !(response.headers.get('location') ?? '').includes('private-value'),
    );
  } finally {
    await app.close();
  }
});
