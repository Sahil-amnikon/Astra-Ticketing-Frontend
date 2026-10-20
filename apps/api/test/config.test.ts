import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config';
const valid = {
  DATABASE_URL: 'postgresql://test:secret@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  APP_BASE_URL: 'http://localhost:3000',
};
test('valid configuration has secure docs default', () => {
  const config = readConfig(valid);
  assert.equal(config.ENABLE_API_DOCS, 'false');
  assert.equal(config.CHANGE_EMAIL_ENABLED, 'false');
  assert.equal(config.CHANGE_EMAIL_SENDER, 'change@amnikontechnologies.com');
  assert.equal(config.WEB_GUIDANCE_ENABLED, 'false');
  assert.equal(config.WEB_GUIDANCE_PROVIDER, 'searxng');
});
test('missing and malformed configuration fails without secrets', () => {
  assert.throws(() => readConfig({}), /DATABASE_URL/);
  assert.throws(() => readConfig({ ...valid, PORT: '65536' }), /PORT/);
  assert.throws(
    () =>
      readConfig({
        ...valid,
        WEB_GUIDANCE_ENABLED: 'true',
        WEB_GUIDANCE_PROVIDER: 'brave',
      }),
    /BRAVE_SEARCH_API_KEY/,
  );
  assert.equal(
    readConfig({ ...valid, WEB_GUIDANCE_ENABLED: 'true' })
      .WEB_GUIDANCE_PROVIDER,
    'searxng',
  );
  assert.throws(
    () =>
      readConfig({
        ...valid,
        DATABASE_URL: 'https://user:TOP_SECRET@example.com',
      }),
    (error) => error instanceof Error && !error.message.includes('TOP_SECRET'),
  );
});
test('Entra configuration is all-or-nothing and requires production HTTPS', () => {
  assert.throws(
    () =>
      readConfig({
        ...valid,
        ENTRA_CLIENT_ID: '10000000-0000-4000-8000-000000000001',
      }),
    /ENTRA_CLIENT_ID/,
  );
  assert.throws(
    () =>
      readConfig({
        ...valid,
        NODE_ENV: 'production',
        ENTRA_CLIENT_ID: '10000000-0000-4000-8000-000000000001',
        ENTRA_CLIENT_SECRET: 'not-a-real-secret-value',
        ENTRA_TENANT_ID: '20000000-0000-4000-8000-000000000002',
      }),
    /APP_BASE_URL/,
  );
});
