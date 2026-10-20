import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { createApp } from '../src/app';
import {
  AuthService,
  workspaceUser,
  type AuthenticatedUser,
} from '../src/auth';
import { operationalWrite } from '../src/administration-read-only';
import { TicketService } from '../src/tickets';
import { ChangeService } from '../src/changes';
import { ProblemService } from '../src/problems';
import { ChangeGovernanceService } from '../src/change-governance';

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
const id = '10000000-0000-4000-8000-000000000001';
const account: AuthenticatedUser = {
  id,
  displayName: 'Administrator',
  email: 'admin@example.invalid',
  roles: ['ADMIN'],
  permissions: ['*'],
  clientIds: [id],
  changeAccess: 'CHANGE_MANAGER',
  workScope: 'ALL',
};
const blocked: [string, string][] = [
  ['POST', '/tickets'],
  ['PATCH', `/tickets/${id}`],
  ...[
    'assign',
    'claim',
    'comments',
    'approval',
    'approval/decision',
    'attachments',
  ].map((p): [string, string] => ['POST', `/tickets/${id}/${p}`]),
  ['POST', '/tickets/requesters'],
  ['POST', '/changes'],
  ['POST', '/changes/contacts'],
  ['PATCH', `/changes/${id}/status`],
  ...[
    'teams',
    'tasks',
    'approvals',
    'updates',
    'tickets',
    'stakeholders',
    'attachments',
    'communications',
  ].map((p): [string, string] => ['POST', `/changes/${id}/${p}`]),
  ['PATCH', `/changes/${id}/tasks/${id}`],
  ['PATCH', `/changes/${id}/approvals/${id}`],
  ['POST', '/problems'],
  ['PATCH', `/problems/${id}`],
  ['POST', `/problems/${id}/tickets`],
  ['DELETE', `/problems/${id}/tickets/${id}`],
  ['POST', `/problems/${id}/notes`],
  ['PATCH', `/change-governance/${id}`],
  ['POST', `/change-governance/${id}/cab`],
  ['POST', `/change-governance/${id}/reviews`],
  ['POST', `/internal/tickets/${id}/help`],
  ['PATCH', `/internal/tickets/${id}/help/${id}`],
  ['POST', `/knowledge/${id}/tickets`],
  ['POST', `/mail/intake/${id}`],
];

test('administration separates service record writes from configuration, reads and preferences', () => {
  for (const [method, path] of blocked) {
    assert.equal(
      operationalWrite(method, path + '?workspace=admin'),
      true,
      path,
    );
    assert.equal(operationalWrite('GET', path), false, path);
  }
  for (const path of [
    '/admin/users',
    '/admin/groups',
    '/admin/categories',
    '/sla/policies',
    '/internal/departments',
    '/change-governance/policy',
    '/change-governance/groups',
    `/change-governance/groups/${id}`,
    '/change-governance/templates',
    '/change-governance/blackouts',
    '/tickets/views',
    `/tickets/views/${id}`,
    '/auth/logout',
  ])
    assert.equal(operationalWrite('POST', path), false, path);
});

async function fixture() {
  const app = await createApp();
  const auth = app.get(AuthService);
  auth.currentUser = async (r) =>
    workspaceUser(
      account,
      String(r.headers['x-amnikon-workspace'] ?? 'operations'),
    );
  auth.verifyCsrf = async (r) => {
    if (
      r.headers.origin !== 'http://localhost:3000' ||
      r.headers['x-csrf-token'] !== 'fixture'
    )
      throw new ForbiddenException();
  };
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const request = (
    method: string,
    path: string,
    workspace = 'admin',
    body: object = {},
  ) =>
    fetch(base + path, {
      method,
      headers: {
        'x-amnikon-workspace': workspace,
        'x-csrf-token': 'fixture',
        origin: 'http://localhost:3000',
        'content-type': 'application/json',
      },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    });
  return { app, request };
}

test('real HTTP service routes reject all administration writes before validation or data changes', async () => {
  const { app, request } = await fixture();
  try {
    for (const [method, path] of blocked) {
      const response = await request(method, path);
      assert.equal(response.status, 403, method + ' ' + path);
      assert.equal((await response.json()).error.code, 'HTTP_403');
    }
  } finally {
    await app.close();
  }
});

test('administration reads and change policy remain available; support workspaces retain creation', async () => {
  const { app, request } = await fixture();
  try {
    const reads: string[] = [];
    for (const service of [
      app.get(TicketService),
      app.get(ChangeService),
      app.get(ProblemService),
    ])
      Object.assign(service, {
        list: async (user: AuthenticatedUser) => {
          reads.push(user.workspace ?? '');
          return { items: [], total: 0 };
        },
      });
    for (const path of ['/tickets', '/changes', '/problems'])
      assert.equal((await request('GET', path)).status, 200);
    assert.deepEqual(reads, ['admin', 'admin', 'admin']);
    let policySaved = false;
    Object.assign(app.get(ChangeGovernanceService), {
      policy: async (user: AuthenticatedUser) => {
        assert.equal(user.workspace, 'admin');
        policySaved = true;
        return { saved: true };
      },
    });
    assert.equal(
      (
        await request('PATCH', '/change-governance/policy', 'admin', {
          highRiskCab: true,
          minimumApprovals: 2,
          reviewRequired: true,
        })
      ).status,
      200,
    );
    assert.equal(policySaved, true);
    const roles: string[][] = [];
    Object.assign(app.get(ProblemService), {
      create: async (user: AuthenticatedUser) => {
        roles.push(user.roles);
        return { id };
      },
    });
    for (const workspace of ['operations', 'management'])
      assert.equal(
        (
          await request('POST', '/problems', workspace, {
            clientId: id,
            title: 'Investigation',
            description: 'Investigate a recurring incident',
            priority: 'P3_MEDIUM',
          })
        ).status,
        201,
      );
    assert.deepEqual(roles, [['TECHNICIAN'], ['MANAGER']]);
    assert.equal(
      (
        await request('POST', '/problems', 'chooser', {
          clientId: id,
          title: 'Investigation',
          description: 'Investigate recurring incidents',
          priority: 'P3_MEDIUM',
        })
      ).status,
      403,
    );
  } finally {
    await app.close();
  }
});
