import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServiceUnavailableException } from '@nestjs/common';
import { AuthController, AuthService, destinationFor } from '../src/auth';
import type { FastifyReply } from 'fastify';
import type { Dependencies } from '../src/dependencies';

const baseEnvironment = {
  DATABASE_URL: 'postgresql://test:secret@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  APP_BASE_URL: 'http://localhost:3000',
  NODE_ENV: 'test',
  ENTRA_CLIENT_ID: '',
  ENTRA_CLIENT_SECRET: '',
  ENTRA_TENANT_ID: '',
  INITIAL_ADMIN_OBJECT_IDS: '',
};

test('authentication remains closed when Entra is not configured', async () => {
  Object.assign(process.env, baseEnvironment);
  const service = new AuthService({} as Dependencies);
  assert.equal(service.isConfigured(), false);
  await assert.rejects(
    service.beginLogin(),
    (error) => error instanceof ServiceUnavailableException,
  );
});

test('session cookie is HTTP-only and secure for an HTTPS deployment', () => {
  Object.assign(process.env, baseEnvironment, {
    NODE_ENV: 'production',
    APP_BASE_URL: 'https://tickets.lab.example',
    ENTRA_CLIENT_ID: '10000000-0000-4000-8000-000000000001',
    ENTRA_CLIENT_SECRET: 'not-a-real-secret-value',
    ENTRA_TENANT_ID: '20000000-0000-4000-8000-000000000002',
    INITIAL_ADMIN_OBJECT_IDS: '30000000-0000-4000-8000-000000000003',
  });
  const service = new AuthService({} as Dependencies);
  const cookie = service.sessionCookie('opaque-session-token');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /not-a-real-secret-value/);
});

test('login sets an explicit redirect status', async () => {
  const service = {
    beginLogin: async () => 'https://login.microsoftonline.com/example',
  } as AuthService;
  let statusCode: number | undefined;
  let destination: string | undefined;
  const reply = {
    code(code: number) {
      statusCode = code;
      return this;
    },
    redirect(url: string) {
      destination = url;
      return this;
    },
  } as unknown as FastifyReply;

  await new AuthController(service).login(undefined, reply);

  assert.equal(statusCode, 302);
  assert.equal(destination, 'https://login.microsoftonline.com/example');
});

test('login state accepts only approved internal portal destinations', async () => {
  Object.assign(process.env, baseEnvironment, {
    ENTRA_CLIENT_ID: '10000000-0000-4000-8000-000000000001',
    ENTRA_CLIENT_SECRET: 'not-a-real-secret-value',
    ENTRA_TENANT_ID: '20000000-0000-4000-8000-000000000002',
  });
  const states: { returnTo: string }[] = [];
  const service = new AuthService({
    redis: {
      status: 'ready',
      set: async (_key: string, value: string) => {
        states.push(JSON.parse(value) as { returnTo: string });
      },
    },
  } as unknown as Dependencies);
  await service.beginLogin('/client');
  await service.beginLogin('https://untrusted.invalid');
  await service.beginLogin('/management');
  assert.deepEqual(
    states.map((state) => state.returnTo),
    ['/client', '/', '/management'],
  );
});

test('workspace destinations preserve explicit role-authorized choices', () => {
  assert.equal(destinationFor(['ADMIN'], '/'), '/');
  assert.equal(destinationFor(['ADMIN'], '/admin'), '/admin');
  assert.equal(destinationFor(['MANAGER'], '/management'), '/management');
  assert.equal(destinationFor(['TECHNICIAN'], '/operations'), '/operations');
  assert.equal(destinationFor(['TECHNICIAN'], '/management'), '/');
  assert.equal(destinationFor(['USER'], '/client'), '/client');
  assert.equal(destinationFor(['TECHNICIAN'], '/client'), '/');
});
