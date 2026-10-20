import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';
import { EntraDirectoryService } from '../src/entra-directory';

const environment = {
  DATABASE_URL: 'postgresql://test:secret@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  APP_BASE_URL: 'https://tickets.lab.example',
  NODE_ENV: 'test',
  ENTRA_CLIENT_ID: '10000000-0000-4000-8000-000000000001',
  ENTRA_CLIENT_SECRET: 'not-a-real-secret-value',
  ENTRA_TENANT_ID: '20000000-0000-4000-8000-000000000002',
  INITIAL_ADMIN_OBJECT_IDS: '',
};

test('directory lookup returns identity fields supplied by Microsoft Graph', async () => {
  Object.assign(process.env, environment);
  const originalFetch = globalThis.fetch;
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).includes('/oauth2/v2.0/token')) {
      return Response.json({ access_token: 'graph-token', expires_in: 3600 });
    }
    return Response.json({
      value: [
        {
          id: '30000000-0000-4000-8000-000000000003',
          displayName: 'Azure User',
          mail: 'azure.user@example.com',
          userPrincipalName: 'azure.user@example.com',
        },
      ],
    });
  };

  try {
    const result = await new EntraDirectoryService().findByIdentifier(
      'Azure.User@example.com',
    );
    assert.equal(result.displayName, 'Azure User');
    assert.equal(result.email, 'azure.user@example.com');
    assert.match(requests[1]?.url ?? '', /graph\.microsoft\.com\/v1\.0\/users/);
    assert.equal(
      (requests[1]?.init?.headers as Record<string, string>).authorization,
      'Bearer graph-token',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('directory lookup rejects an identifier not found in Microsoft Graph', async () => {
  Object.assign(process.env, environment);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).includes('/oauth2/v2.0/token')
      ? Response.json({ access_token: 'graph-token', expires_in: 3600 })
      : Response.json({ value: [] });

  try {
    await assert.rejects(
      new EntraDirectoryService().findByIdentifier('missing@example.com'),
      (error) => error instanceof NotFoundException,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ambiguous directory matches are rejected rather than choosing an identity', async () => {
  Object.assign(process.env, environment);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    String(input).includes('/oauth2/v2.0/token')
      ? Response.json({ access_token: 'graph-token', expires_in: 3600 })
      : Response.json({ value: [{ id: 'one' }, { id: 'two' }] });
  try {
    await assert.rejects(
      new EntraDirectoryService().findByIdentifier('shared@example.com'),
      /More than one directory account/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('directory search accepts a partial name and returns selectable matches', async () => {
  Object.assign(process.env, environment);
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    if (String(input).includes('/oauth2/v2.0/token'))
      return Response.json({ access_token: 'graph-token', expires_in: 3600 });
    return Response.json({
      value: [
        {
          id: '30000000-0000-4000-8000-000000000003',
          displayName: 'Mohammed Rashid',
          mail: 'mohammed.rashid@example.com',
          userPrincipalName: 'mohammed.rashid@example.com',
        },
        {
          id: '30000000-0000-4000-8000-000000000004',
          displayName: 'Mohammed Ali',
          mail: 'mohammed.ali@example.com',
          userPrincipalName: 'mohammed.ali@example.com',
        },
      ],
    });
  };
  try {
    const result = await new EntraDirectoryService().search('Mohammed');
    assert.equal(result.length, 2);
    assert.equal(result[0]?.displayName, 'Mohammed Rashid');
    assert.match(
      decodeURIComponent(requests[1] ?? ''),
      /startsWith\(displayName,'Mohammed'\)/,
    );
    assert.match(
      decodeURIComponent(requests[1] ?? ''),
      /startsWith\(surname,'Mohammed'\)/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
