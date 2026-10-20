import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';
Object.assign(process.env, {
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  APP_BASE_URL: 'http://localhost:3000',
  ENABLE_API_DOCS: 'false',
});
for (const ready of [true, false])
  test(`API readiness ${ready} and independent liveness`, async () => {
    const app = await createApp({ check: async () => ready });
    try {
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      const live = await fetch(`${base}/health`);
      assert.equal(live.status, 200);
      assert.equal(live.headers.get('x-content-type-options'), 'nosniff');
      const response = await fetch(`${base}/ready`);
      assert.equal(response.status, ready ? 200 : 503);
      const data = await response.json();
      if (!ready) {
        assert.equal(data.error.code, 'HTTP_503');
        assert.ok(data.error.requestId);
        assert.equal(JSON.stringify(data).includes('postgres'), false);
      }
      assert.equal((await fetch(`${base}/docs`)).status, 404);
      assert.equal((await fetch(`${base}/docs-json`)).status, 404);
      assert.equal((await fetch(`${base}/tickets`)).status, 404);
    } finally {
      await app.close();
    }
  });

test('OpenAPI JSON is available only when explicitly enabled', async () => {
  process.env.ENABLE_API_DOCS = 'true';
  const app = await createApp({ check: async () => true });
  try {
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/docs-json`);
    assert.equal(response.status, 200);
    const document = await response.json();
    assert.ok(document.paths['/health']);
    assert.ok(document.paths['/ready']);
  } finally {
    process.env.ENABLE_API_DOCS = 'false';
    await app.close();
  }
});
