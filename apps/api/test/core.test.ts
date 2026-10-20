import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AuthenticatedUser } from '../src/auth';
import { CoreService } from '../src/core';
import type { Dependencies } from '../src/dependencies';
import type { EntraDirectoryService } from '../src/entra-directory';

Object.assign(process.env, {
  DATABASE_URL: 'postgresql://test:secret@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  APP_BASE_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
  ENTRA_CLIENT_ID: '',
  ENTRA_CLIENT_SECRET: '',
  ENTRA_TENANT_ID: '',
  INITIAL_ADMIN_OBJECT_IDS: '',
});

function user(roles: string[], clientIds: string[]): AuthenticatedUser {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    displayName: 'Test User',
    email: 'user@example.invalid',
    roles,
    clientIds,
  };
}

test('client user queries are restricted to assigned client IDs', async () => {
  const captured: unknown[][] = [];
  const dependencies = {
    db: {
      query: async (_sql: string, values: unknown[]) => {
        captured.push(values);
        return { rows: [] };
      },
    },
  } as unknown as Dependencies;
  const service = new CoreService(dependencies, {} as EntraDirectoryService);
  const clientA = '20000000-0000-4000-8000-000000000002';
  const clientB = '30000000-0000-4000-8000-000000000003';

  await service.contacts(user(['USER'], [clientA]));
  await service.contacts(user(['USER'], [clientA]), clientB);

  assert.deepEqual(captured[0]?.[0], [clientA]);
  assert.deepEqual(captured[1]?.[0], []);
});

test('staff queries are restricted to assigned clients', async () => {
  const captured: unknown[][] = [];
  const dependencies = {
    db: {
      query: async (_sql: string, values: unknown[]) => {
        captured.push(values);
        return { rows: [] };
      },
    },
  } as unknown as Dependencies;
  const service = new CoreService(dependencies, {} as EntraDirectoryService);
  const clientA = '20000000-0000-4000-8000-000000000002';

  await service.assets(user(['TECHNICIAN'], [clientA]));
  await service.assets(user(['TECHNICIAN'], [clientA]), clientA);

  assert.deepEqual(captured[0]?.[0], [clientA]);
  assert.deepEqual(captured[1]?.[0], [clientA]);
});

test('user provisioning revalidates identity data through Microsoft Graph', async () => {
  const queries: { sql: string; values?: unknown[] }[] = [];
  const databaseUserId = '40000000-0000-4000-8000-000000000004';
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      return sql.includes('INSERT INTO users')
        ? { rows: [{ id: databaseUserId }] }
        : { rows: [] };
    },
    release() {},
  };
  const dependencies = {
    db: { connect: async () => client },
  } as unknown as Dependencies;
  const directory = {
    findById: async () => ({
      id: '30000000-0000-4000-8000-000000000003',
      displayName: 'Verified Azure User',
      email: 'verified@example.com',
      userPrincipalName: 'verified@example.com',
    }),
  } as unknown as EntraDirectoryService;
  const service = new CoreService(dependencies, directory);

  await service.createUser(
    {
      entraObjectId: '30000000-0000-4000-8000-000000000003',
      roles: ['ADMIN'],
      clientIds: [],
    },
    user(['ADMIN'], []),
  );

  const insert = queries.find(({ sql }) => sql.includes('INSERT INTO users'));
  assert.deepEqual(insert?.values?.slice(2, 4), [
    'verified@example.com',
    'Verified Azure User',
  ]);
  assert.ok(queries.some(({ sql }) => sql === 'COMMIT'));
});
