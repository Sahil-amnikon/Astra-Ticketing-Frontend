import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChangeService } from '../src/changes';
import { InternalService } from '../src/internal';
import type { AuthenticatedUser } from '../src/auth';
import type { Dependencies } from '../src/dependencies';

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
const ids = {
  user: '10000000-0000-4000-8000-000000000001',
  other: '10000000-0000-4000-8000-000000000002',
  client: '20000000-0000-4000-8000-000000000001',
  ticket: '30000000-0000-4000-8000-000000000001',
  change: '40000000-0000-4000-8000-000000000001',
  help: '50000000-0000-4000-8000-000000000001',
  department: '60000000-0000-4000-8000-000000000001',
  contact: '70000000-0000-4000-8000-000000000001',
  site: '80000000-0000-4000-8000-000000000001',
};
function user(changeAccess = 'CONTRIBUTOR'): AuthenticatedUser {
  return {
    id: ids.user,
    displayName: 'Staff',
    email: 'staff@example.invalid',
    roles: ['TECHNICIAN'],
    clientIds: [ids.client],
    siteIds: [],
    permissions: [],
    workScope: 'BOTH',
    changeAccess: changeAccess as AuthenticatedUser['changeAccess'],
    departmentIds: [ids.department],
  };
}

test('change access is hidden and API-blocked when administrator has not enabled it', async () => {
  const service = new ChangeService({} as Dependencies);
  await assert.rejects(
    () => service.dashboard(user('NONE')),
    ForbiddenException,
  );
});

test('change cannot begin implementation while a required approval is pending', async () => {
  const db = {
    connect: async () => ({ ...db, release: () => {} }),
    query: async (sql: string) => {
      if (
        sql.includes('SELECT c.* FROM changes') ||
        sql.includes('SELECT * FROM changes')
      )
        return {
          rows: [
            {
              id: ids.change,
              client_id: ids.client,
              owner_user_id: ids.user,
              status: 'SCHEDULED',
              revision: 1,
            },
          ],
        };
      if (sql.includes('change_governance_policy'))
        return {
          rows: [{ minimum_approvals: 1, high_risk_cab: true }],
          rowCount: 1,
        };
      if (sql.includes('FROM change_approvals'))
        return {
          rows: [{ id: 'pending', status: 'PENDING', required: true }],
          rowCount: 1,
        };
      return { rows: [], rowCount: 0 };
    },
  };
  const service = new ChangeService({ db } as unknown as Dependencies);
  await assert.rejects(
    () =>
      service.status(ids.change, user('COORDINATOR'), {
        status: 'IN_PROGRESS',
      }),
    BadRequestException,
  );
});

test('external stakeholders can be added without creating a portal account', async () => {
  const queries: { sql: string; values?: unknown[] }[] = [];
  const db = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes('SELECT c.* FROM changes'))
        return {
          rows: [
            {
              id: ids.change,
              client_id: ids.client,
              owner_user_id: ids.user,
            },
          ],
          rowCount: 1,
        };
      if (sql.includes('INSERT INTO change_stakeholders'))
        return { rows: [{ id: ids.other }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  const service = new ChangeService({ db } as unknown as Dependencies);
  await service.addStakeholder(ids.change, user('COORDINATOR'), {
    externalName: 'Vendor Engineer',
    externalEmail: 'Vendor@example.invalid',
    role: 'TECHNICAL_CONTACT',
  });
  const insert = queries.find((item) =>
    item.sql.includes('INSERT INTO change_stakeholders'),
  );
  assert.ok(insert);
  assert.ok(insert.values?.includes('vendor@example.invalid'));
  assert.ok(
    queries.some(
      (item) =>
        item.sql.includes('INSERT INTO change_history') &&
        item.values?.includes('CHANGE.STAKEHOLDER_ADDED'),
    ),
  );
});

test('selected change stakeholders are client contacts from the change organization', async () => {
  const queries: { sql: string; values?: unknown[] }[] = [];
  const db = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes('SELECT c.* FROM changes'))
        return {
          rows: [
            {
              id: ids.change,
              client_id: ids.client,
              owner_user_id: ids.user,
            },
          ],
          rowCount: 1,
        };
      if (sql.includes('INSERT INTO change_stakeholders'))
        return { rows: [{ id: ids.other }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  const service = new ChangeService({ db } as unknown as Dependencies);
  await service.addStakeholder(ids.change, user('COORDINATOR'), {
    contactId: ids.contact,
    role: 'BUSINESS_CONTACT',
  });
  const insert = queries.find((item) =>
    item.sql.includes('INSERT INTO change_stakeholders'),
  );
  assert.ok(insert);
  assert.match(
    insert.sql,
    /JOIN changes ch ON ch\.id=\$1 AND ch\.client_id=ct\.client_id/,
  );
  assert.match(insert.sql, /lower\(iu\.email\)=lower\(ct\.email\)/);
  assert.match(insert.sql, /'TECHNICIAN'/);
  assert.ok(insert.values?.includes(ids.contact));
});

test('change stakeholder options exclude contacts linked to internal staff', async () => {
  const queries: string[] = [];
  const db = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes('mail_settings'))
        return {
          rows: [
            {
              enabled: false,
              change_address: 'change@amnikontechnologies.com',
            },
          ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 0 };
    },
  };
  const service = new ChangeService({ db } as unknown as Dependencies);
  await service.options(user());
  const contactQuery = queries.find((sql) => sql.includes('FROM contacts ct'));
  assert.ok(contactQuery);
  assert.match(contactQuery, /NOT EXISTS/);
  assert.match(contactQuery, /iu\.id=ct\.user_id/);
  assert.match(contactQuery, /lower\(iu\.email\)=lower\(ct\.email\)/);
  assert.match(
    contactQuery,
    /'INTERN','TECHNICIAN','TEAM_LEAD','MANAGER','ADMIN'/,
  );
});

test('change intake creates and audits a site-linked client contact', async () => {
  const queries: { sql: string; values?: unknown[] }[] = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      queries.push({ sql, values });
      if (sql.includes('SELECT 1 FROM sites'))
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      if (sql.includes('SELECT 1 FROM contacts'))
        return { rows: [], rowCount: 0 };
      if (sql.includes('INSERT INTO contacts'))
        return {
          rows: [
            {
              id: ids.contact,
              client_id: ids.client,
              site_id: ids.site,
              name: 'Client Approver',
              email: 'approver@example.invalid',
            },
          ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const service = new ChangeService({
    db: { connect: async () => client },
  } as unknown as Dependencies);
  const contact = await service.createContact(user(), {
    clientId: ids.client,
    siteId: ids.site,
    name: 'Client Approver',
    email: 'Approver@example.invalid',
  });
  assert.equal(contact.id, ids.contact);
  assert.ok(
    queries.some(
      (item) =>
        item.sql.includes('INSERT INTO contacts') &&
        item.values?.includes(ids.site) &&
        item.values?.includes('Approver@example.invalid'),
    ),
  );
  assert.ok(
    queries.some(
      (item) =>
        item.sql.includes('INSERT INTO audit_logs') &&
        item.values?.some(
          (value) =>
            typeof value === 'string' && value.includes('CHANGE_INTAKE'),
        ),
    ),
  );
  assert.ok(queries.some((item) => item.sql === 'COMMIT'));
});

test('change attachments reject executable content before it is stored', async () => {
  const db = {
    query: async (sql: string) => {
      if (sql.includes('SELECT c.* FROM changes'))
        return {
          rows: [
            {
              id: ids.change,
              client_id: ids.client,
              owner_user_id: ids.user,
            },
          ],
          rowCount: 1,
        };
      return { rows: [], rowCount: 0 };
    },
  };
  const service = new ChangeService({ db } as unknown as Dependencies);
  await assert.rejects(
    () =>
      service.addAttachment(ids.change, user('CONTRIBUTOR'), {
        fileName: 'unsafe.exe',
        contentType: 'application/x-msdownload',
        contentBase64: Buffer.from('unsafe').toString('base64'),
      }),
    BadRequestException,
  );
});

test('accepting a help request adds only the accepting specialist as ticket collaborator', async () => {
  const queries: string[] = [];
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (sql.includes('SELECT t.id,t.ticket_number'))
        return {
          rows: [
            {
              id: ids.ticket,
              ticket_number: 'INC-000001',
              subject: 'Internal project',
              client_id: ids.client,
            },
          ],
        };
      if (sql.includes('SELECT h.*,t.ticket_number'))
        return {
          rows: [
            {
              id: ids.help,
              requested_by_user_id: ids.other,
              expertise_needed: 'Microsoft 365',
              ticket_number: 'INC-000001',
              subject: 'Internal project',
            },
          ],
        };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const service = new InternalService({
    db: { query: client.query, connect: async () => client },
  } as unknown as Dependencies);
  await service.decideHelp(
    ids.ticket,
    ids.help,
    { status: 'ACCEPTED', note: 'I can assist' },
    user(),
  );
  assert.ok(
    queries.some((sql) => sql.includes('INSERT INTO ticket_collaborators')),
  );
  assert.ok(queries.some((sql) => sql.includes('TICKET.HELP_REQUEST_UPDATED')));
  assert.ok(queries.some((sql) => sql === 'COMMIT'));
});
