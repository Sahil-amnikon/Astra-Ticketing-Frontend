import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type, plainToInstance } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  validate,
} from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { AuthService, AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';
import {
  CreateClientDto,
  CreateContactDto,
  CreateSiteDto,
  CreateAssetDto,
  CreateCategoryDto,
  CreateTagDto,
} from './core';
import { PERMISSION_CODES, permissionsForRoles } from './access';

const resources = {
  clients: {
    table: 'clients',
    type: 'CLIENT',
    fields: {
      name: 'name',
      ticketPrefix: 'ticket_prefix',
      primaryEmail: 'primary_email',
      primaryPhone: 'primary_phone',
      notes: 'notes',
    },
    dto: CreateClientDto,
  },
  contacts: {
    table: 'contacts',
    type: 'CONTACT',
    fields: {
      clientId: 'client_id',
      siteId: 'site_id',
      name: 'name',
      email: 'email',
      phone: 'phone',
    },
    dto: CreateContactDto,
  },
  sites: {
    table: 'sites',
    type: 'SITE',
    fields: {
      clientId: 'client_id',
      name: 'name',
      address: 'address',
      ticketPrefix: 'ticket_prefix',
    },
    dto: CreateSiteDto,
  },
  assets: {
    table: 'assets',
    type: 'ASSET',
    fields: {
      clientId: 'client_id',
      siteId: 'site_id',
      name: 'name',
      assetType: 'asset_type',
      serialNumber: 'serial_number',
      externalReference: 'external_reference',
    },
    dto: CreateAssetDto,
  },
  categories: {
    table: 'categories',
    type: 'CATEGORY',
    fields: { parentId: 'parent_id', name: 'name', description: 'description' },
    dto: CreateCategoryDto,
  },
  tags: {
    table: 'tags',
    type: 'TAG',
    fields: { name: 'name', description: 'description' },
    dto: CreateTagDto,
  },
  sources: {
    table: 'ticket_sources',
    type: 'TICKET_SOURCE',
    fields: { name: 'name' },
    dto: CreateTagDto,
    idColumn: 'code',
  },
  departments: {
    table: 'departments',
    type: 'DEPARTMENT',
    fields: { name: 'name', description: 'description' },
    dto: CreateTagDto,
  },
} as const;
type Resource = keyof typeof resources;
function resourceConfig(name: string) {
  if (!Object.hasOwn(resources, name)) throw new NotFoundException();
  return resources[name as Resource];
}

const PRIVATE_AUDIT_FIELDS = new Set([
  'phone',
  'primary_phone',
  'email',
  'primary_email',
  'requester_email',
  'entra_object_id',
  'entra_tenant_id',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function auditKey(key: string) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function sanitizeAuditDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditDetails);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !PRIVATE_AUDIT_FIELDS.has(auditKey(key)))
      .map(([key, item]) => [key, sanitizeAuditDetails(item)]),
  );
}

function resolveAuditReferences(
  value: unknown,
  names: Map<string, string>,
): unknown {
  if (Array.isArray(value))
    return value.map((item) => resolveAuditReferences(item, names));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        resolveAuditReferences(item, names),
      ]),
    );
  if (typeof value === 'string' && UUID_PATTERN.test(value))
    return names.get(value) ?? null;
  return value;
}
export class AdminQuery {
  @IsOptional() @IsString() @MaxLength(200) q = '';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsIn(['all', 'active', 'inactive']) status = 'all';
  @IsOptional() @IsUUID() clientId?: string;
}
export class UpdateAccessDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1)
  @IsIn(['USER', 'INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'], {
    each: true,
  })
  roles!: string[];
  @IsArray() @IsUUID(undefined, { each: true }) clientIds!: string[];
  @IsArray() @IsUUID(undefined, { each: true }) siteIds?: string[] = [];
  @IsArray() @IsIn(PERMISSION_CODES, { each: true }) permissions?: string[] =
    [];
  @IsBoolean() active!: boolean;
  @IsOptional() @IsIn(['INTERNAL', 'CLIENT', 'BOTH', 'ALL']) workScope?: string;
  @IsOptional()
  @IsIn(['NONE', 'CONTRIBUTOR', 'COORDINATOR', 'APPROVER', 'CHANGE_MANAGER'])
  changeAccess?: string;
  @IsOptional() @IsUUID() supervisorUserId?: string;
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  departmentIds?: string[] = [];
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  leadDepartmentIds?: string[] = [];
  @IsOptional() @IsString() @MaxLength(1000) expertise?: string;
}
export class DeleteConfirmationDto {
  @IsString() @MaxLength(20) confirmation!: string;
}
@Injectable()
export class AdminService {
  constructor(private readonly dependencies: Dependencies) {}
  async list(
    resource: string,
    query: AdminQuery,
    includeDomainRouting = false,
  ) {
    let source: string;
    let order = 'r.name, r.id';
    if (resource === 'users') {
      source = `SELECT u.id, u.display_name AS name, u.email, u.active, u.last_login_at,u.work_scope,u.change_access,u.supervisor_user_id,
        ARRAY(SELECT role_code FROM user_roles WHERE user_id=u.id ORDER BY role_code) AS roles,
        ARRAY(SELECT client_id::text FROM client_users WHERE user_id=u.id ORDER BY client_id) AS client_ids,
        ARRAY(SELECT site_id::text FROM user_sites WHERE user_id=u.id ORDER BY site_id) AS site_ids,
        ARRAY(SELECT permission_code FROM user_permissions WHERE user_id=u.id ORDER BY permission_code) AS permissions,
        ARRAY(SELECT department_id::text FROM department_users WHERE user_id=u.id ORDER BY department_id) AS department_ids,
        ARRAY(SELECT department_id::text FROM department_users WHERE user_id=u.id AND is_lead ORDER BY department_id) AS lead_department_ids,
        (SELECT string_agg(DISTINCT expertise,'; ') FROM department_users WHERE user_id=u.id AND expertise IS NOT NULL) AS expertise FROM users u`;
    } else if (resource === 'audit-logs') {
      source = `SELECT a.id, a.action AS name, a.action, a.entity_type, a.entity_id, a.details, a.created_at, COALESCE(u.display_name, 'System') AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id`;
      order = 'r.id DESC';
    } else {
      const config = resourceConfig(resource);
      source = `SELECT t.*${resource === 'sources' ? ', t.code AS id' : ''}${['contacts', 'sites', 'assets'].includes(resource) ? ', c.name AS client_name' : ''} FROM ${config.table} t${['contacts', 'sites', 'assets'].includes(resource) ? ' JOIN clients c ON c.id=t.client_id' : ''}`;
      if (resource === 'sites' && includeDomainRouting)
        source = `SELECT t.*,c.name AS client_name,c.ticket_prefix AS client_ticket_prefix,c.organization_type,c.status AS client_status,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'domain',d.domain,'active',d.active) ORDER BY d.domain) FROM client_email_domains d WHERE d.site_id=t.id AND d.client_id=t.client_id),'[]') AS email_domains
          FROM sites t JOIN clients c ON c.id=t.client_id`;
    }
    const active =
      resource === 'clients'
        ? "r.status = 'ACTIVE'"
        : resource === 'audit-logs'
          ? 'true'
          : 'r.active';
    const scoped = ['contacts', 'sites', 'assets'].includes(resource)
      ? 'r.client_id = $4::uuid'
      : resource === 'users'
        ? '$4 = ANY(r.client_ids)'
        : 'false';
    const where = `WHERE ($1 = '' OR to_jsonb(r)::text ILIKE $2) AND ($3 = 'all' OR (${active}) = ($3 = 'active')) AND ($4::text IS NULL OR ${scoped})`;
    const values = [
      query.q,
      `%${query.q.replace(/[\\%_]/g, '\\$&')}%`,
      query.status,
      query.clientId ?? null,
    ];
    // One statement keeps count and page consistent under concurrent changes.
    const result = await this.dependencies.db.query(
      `WITH records AS (${source}), filtered AS (SELECT r.* FROM records r ${where})
      SELECT (SELECT count(*)::int FROM filtered) AS total,
      COALESCE((SELECT jsonb_agg(p) FROM (SELECT r.* FROM filtered r ORDER BY ${order} LIMIT $5 OFFSET $6) p), '[]'::jsonb) AS items`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    );
    const page = {
      ...result.rows[0],
      page: query.page,
      pageSize: query.pageSize,
    } as { items?: Record<string, unknown>[] };
    if (resource === 'audit-logs' && page.items?.length) {
      const references = await this.dependencies.db.query<{
        id: string;
        label: string;
      }>(`SELECT id::text,label FROM (
        SELECT id,name AS label FROM clients
        UNION ALL SELECT id,name FROM contacts
        UNION ALL SELECT id,name FROM sites
        UNION ALL SELECT id,name FROM assets
        UNION ALL SELECT c.id,CASE WHEN p.name IS NULL THEN c.name ELSE p.name || ' → ' || c.name END FROM categories c LEFT JOIN categories p ON p.id=c.parent_id
        UNION ALL SELECT id,name FROM tags
        UNION ALL SELECT id,display_name FROM users
        UNION ALL SELECT id,ticket_number FROM tickets
        UNION ALL SELECT id,name FROM access_groups
      ) AS reference_names`);
      const names = new Map(
        references.rows.map((item) => [item.id, item.label]),
      );
      page.items = page.items.map((item) => ({
        ...item,
        entity_name:
          typeof item.entity_id === 'string'
            ? (names.get(item.entity_id) ?? null)
            : null,
        details: resolveAuditReferences(
          sanitizeAuditDetails(item.details),
          names,
        ),
      }));
    }
    return page;
  }
  async overview() {
    const result = await this.dependencies.db.query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM tickets) AS tickets,
      (SELECT count(*)::int FROM clients) AS clients,
      (SELECT count(*)::int FROM sites) AS sites,
      (SELECT count(*)::int FROM assets) AS assets,
      (SELECT count(*)::int FROM users WHERE active) AS active_users,
      (SELECT count(*)::int FROM clients WHERE organization_type='CLIENT' AND status='ACTIVE') AS active_customers,
      (SELECT count(*)::int FROM contacts WHERE active) AS active_contacts,
      (SELECT count(*)::int FROM access_groups WHERE active) AS active_groups,
      (SELECT count(*)::int FROM access_groups WHERE active AND kind='CUSTOMER') AS customer_groups,
      (SELECT count(*)::int FROM access_groups WHERE active AND kind='STAFF') AS staff_groups`);
    return result.rows[0];
  }
  async updateAccess(
    id: string,
    dto: UpdateAccessDto,
    actor: AuthenticatedUser,
  ) {
    const internalId = '00000000-0000-4000-8000-000000000132';
    const externalClientIds = dto.clientIds.filter((id) => id !== internalId);
    if (dto.roles.includes('USER') && !externalClientIds.length)
      throw new BadRequestException('Client users require client membership');
    const workScope = dto.roles.includes('ADMIN')
      ? 'ALL'
      : (dto.workScope ?? 'CLIENT');
    const changeAccess = dto.roles.includes('ADMIN')
      ? 'CHANGE_MANAGER'
      : (dto.changeAccess ?? 'NONE');
    if (
      dto.roles.includes('INTERN') &&
      !['INTERNAL', 'BOTH'].includes(workScope)
    )
      throw new BadRequestException(
        'Interns require Internal or Both work scope',
      );
    if (
      !dto.roles.includes('ADMIN') &&
      dto.workScope !== undefined &&
      ['CLIENT', 'BOTH'].includes(workScope) &&
      !externalClientIds.length
    )
      throw new BadRequestException(
        'Client or Both work scope requires at least one client',
      );
    if (dto.roles.includes('INTERN') && !dto.supervisorUserId)
      throw new BadRequestException('Interns require a supervisor');
    const effectiveClientIds = [
      ...new Set([
        ...externalClientIds,
        ...(['INTERNAL', 'BOTH', 'ALL'].includes(workScope)
          ? [internalId]
          : []),
      ]),
    ];
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(537002)');
      // Recheck after serialization: a concurrent administrator may have removed access.
      const allowed = await db.query(
        "SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=$1 AND u.active AND r.role_code='ADMIN'",
        [actor.id],
      );
      if (!allowed.rowCount) throw new ForbiddenException();
      const before = await db.query(
        `SELECT u.active,u.work_scope AS "workScope",u.change_access AS "changeAccess",u.supervisor_user_id AS "supervisorUserId", ARRAY(SELECT role_code FROM user_roles WHERE user_id=u.id) AS roles,
          ARRAY(SELECT client_id::text FROM client_users WHERE user_id=u.id) AS "clientIds",
          ARRAY(SELECT site_id::text FROM user_sites WHERE user_id=u.id) AS "siteIds",
          ARRAY(SELECT permission_code FROM user_permissions WHERE user_id=u.id) AS permissions
         FROM users u WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!before.rows[0]) throw new NotFoundException();
      if (!dto.active || !dto.roles.includes('ADMIN')) {
        const remaining = await db.query(
          "SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.active AND r.role_code='ADMIN' AND u.id<>$1 LIMIT 1",
          [id],
        );
        if (!remaining.rowCount)
          throw new ConflictException(
            'At least one active administrator must remain',
          );
      }
      await db.query(
        'UPDATE users SET active=$2,work_scope=$3,change_access=$4,supervisor_user_id=$5,access_expires_at=NULL, session_version=session_version+1, updated_at=now() WHERE id=$1',
        [id, dto.active, workScope, changeAccess, dto.supervisorUserId ?? null],
      );
      await db.query('DELETE FROM user_roles WHERE user_id=$1', [id]);
      await db.query('DELETE FROM client_users WHERE user_id=$1', [id]);
      await db.query('DELETE FROM user_sites WHERE user_id=$1', [id]);
      await db.query('DELETE FROM user_permissions WHERE user_id=$1', [id]);
      await db.query('DELETE FROM department_users WHERE user_id=$1', [id]);
      for (const role of new Set(dto.roles))
        await db.query(
          'INSERT INTO user_roles (user_id,role_code,granted_by) VALUES ($1,$2,$3)',
          [id, role, actor.id],
        );
      for (const client of effectiveClientIds)
        await db.query(
          'INSERT INTO client_users (user_id,client_id) VALUES ($1,$2)',
          [id, client],
        );
      for (const site of new Set(dto.siteIds ?? [])) {
        const inserted = await db.query(
          `INSERT INTO user_sites(user_id,site_id)
           SELECT $1,s.id FROM sites s WHERE s.id=$2 AND s.client_id=ANY($3::uuid[])`,
          [id, site, effectiveClientIds],
        );
        if (!inserted.rowCount)
          throw new BadRequestException(
            'Site access must belong to an assigned client',
          );
      }
      const permissions = permissionsForRoles(dto.roles);
      for (const permission of permissions) {
        const inserted = await db.query(
          `INSERT INTO user_permissions(user_id,permission_code,granted_by)
           SELECT $1,code,$2 FROM permissions WHERE code=$3`,
          [id, actor.id, permission],
        );
        if (!inserted.rowCount)
          throw new BadRequestException('Invalid permission');
      }
      const leadDepartments = new Set(dto.leadDepartmentIds ?? []);
      for (const departmentId of new Set(dto.departmentIds ?? []))
        await db.query(
          'INSERT INTO department_users(department_id,user_id,expertise,is_lead) SELECT id,$2,$3,$4 FROM departments WHERE id=$1 AND active',
          [
            departmentId,
            id,
            dto.expertise?.trim() || null,
            leadDepartments.has(departmentId),
          ],
        );
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES ($1,'USER.ACCESS_UPDATED','USER',$2,$3::jsonb)",
        [
          actor.id,
          id,
          JSON.stringify({
            before: before.rows[0],
            after: {
              ...dto,
              workScope,
              changeAccess,
              clientIds: effectiveClientIds,
              permissions,
            },
          }),
        ],
      );
      await db.query('COMMIT');
      return { id };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  async updateRecord(
    resource: string,
    id: string,
    body: Record<string, unknown>,
    actor: AuthenticatedUser,
  ) {
    if (resource === 'clients' && id === '00000000-0000-4000-8000-000000000132')
      throw new ConflictException('The internal organization is protected');
    const config = resourceConfig(resource);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('A record object is required');
    const { active, ...fields } = body;
    if (typeof active !== 'boolean')
      throw new BadRequestException('Active must be true or false');
    const dto = plainToInstance(config.dto as new () => object, fields);
    if (
      (await validate(dto, { whitelist: true, forbidNonWhitelisted: true }))
        .length
    )
      throw new BadRequestException('Check required fields and formats');
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      if (resource === 'categories')
        await db.query('SELECT pg_advisory_xact_lock(537003)');
      const idColumn = 'idColumn' in config ? config.idColumn : 'id';
      const before = await db.query(
        `SELECT * FROM ${config.table} WHERE ${idColumn}=$1 FOR UPDATE`,
        [id],
      );
      if (!before.rows[0]) throw new NotFoundException();
      if (
        ['contacts', 'sites', 'assets'].includes(resource) &&
        fields.clientId !== before.rows[0].client_id
      )
        throw new BadRequestException('Client ownership cannot be changed');
      if (['contacts', 'assets'].includes(resource) && fields.siteId != null) {
        const site = await db.query(
          'SELECT 1 FROM sites WHERE id=$1 AND client_id=$2 AND active',
          [fields.siteId, before.rows[0].client_id],
        );
        if (!site.rowCount)
          throw new BadRequestException(
            'Site does not belong to the selected organization',
          );
      }
      if (resource === 'categories' && fields.parentId) {
        const cycle = await db.query(
          `WITH RECURSIVE parents AS (SELECT id,parent_id FROM categories WHERE id=$1 UNION SELECT c.id,c.parent_id FROM categories c JOIN parents p ON c.id=p.parent_id) SELECT 1 FROM parents WHERE id=$2`,
          [fields.parentId, id],
        );
        if (cycle.rowCount)
          throw new BadRequestException(
            'Category hierarchy cannot contain a cycle',
          );
      }
      const entries = Object.entries(config.fields);
      const values = entries.map(([key, column]) => {
        const value = fields[key];
        if (
          ['clients', 'sites'].includes(resource) &&
          key === 'ticketPrefix' &&
          value == null
        )
          return before.rows[0][column];
        return typeof value === 'string'
          ? value.trim() || null
          : (value ?? null);
      });
      const statusColumn = resource === 'clients' ? 'status' : 'active';
      await db.query(
        `UPDATE ${config.table} SET ${entries.map(([, column], i) => `${column}=$${i + 2}`).join(',')}, ${statusColumn}=$${entries.length + 2}, updated_at=now() WHERE ${idColumn}=$1`,
        [
          id,
          ...values,
          resource === 'clients' ? (active ? 'ACTIVE' : 'INACTIVE') : active,
        ],
      );
      await db.query(
        'INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5::jsonb)',
        [
          actor.id,
          `${config.type}.UPDATED`,
          config.type,
          id,
          JSON.stringify(
            sanitizeAuditDetails({ before: before.rows[0], after: body }),
          ),
        ],
      );
      await db.query('COMMIT');
      return { id };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  async deleteRecord(
    resource: string,
    id: string,
    confirmation: string,
    actor: AuthenticatedUser,
  ) {
    if (confirmation.trim().toLowerCase() !== 'delete')
      throw new BadRequestException('Type delete to confirm permanent removal');
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      if (resource === 'users') {
        await db.query('SELECT pg_advisory_xact_lock(537002)');
        if (id === actor.id)
          throw new ConflictException(
            'Administrators cannot remove their own account',
          );
        const allowed = await db.query(
          "SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=$1 AND u.active AND r.role_code='ADMIN'",
          [actor.id],
        );
        if (!allowed.rowCount) throw new ForbiddenException();
        const before = await db.query(
          `SELECT u.*, ARRAY(SELECT role_code FROM user_roles WHERE user_id=u.id) AS roles
           FROM users u WHERE u.id=$1 FOR UPDATE`,
          [id],
        );
        if (!before.rows[0]) throw new NotFoundException();
        if ((before.rows[0].roles as string[]).includes('ADMIN')) {
          const remaining = await db.query(
            "SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.active AND r.role_code='ADMIN' AND u.id<>$1 LIMIT 1",
            [id],
          );
          if (!remaining.rowCount)
            throw new ConflictException(
              'At least one active administrator must remain',
            );
        }
        await db.query('DELETE FROM users WHERE id=$1', [id]);
        await db.query(
          "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES ($1,'USER.DELETED','USER',$2,$3::jsonb)",
          [
            actor.id,
            id,
            JSON.stringify(sanitizeAuditDetails({ before: before.rows[0] })),
          ],
        );
      } else {
        if (
          resource === 'clients' &&
          id === '00000000-0000-4000-8000-000000000132'
        )
          throw new ConflictException('The internal organization is protected');
        const config = resourceConfig(resource);
        if (resource === 'categories')
          await db.query('SELECT pg_advisory_xact_lock(537003)');
        const idColumn = 'idColumn' in config ? config.idColumn : 'id';
        const before = await db.query(
          `SELECT * FROM ${config.table} WHERE ${idColumn}=$1 FOR UPDATE`,
          [id],
        );
        if (!before.rows[0]) throw new NotFoundException();
        if (resource === 'contacts') {
          const linked = await db.query(
            `SELECT
               EXISTS(SELECT 1 FROM tickets WHERE requester_id=$1) AS ticket,
               EXISTS(SELECT 1 FROM change_stakeholders WHERE contact_id=$1) AS change`,
            [id],
          );
          if (linked.rows[0]?.ticket || linked.rows[0]?.change) {
            await db.query(
              'UPDATE contacts SET active=false,updated_at=now() WHERE id=$1',
              [id],
            );
            await db.query(
              "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES ($1,'CONTACT.DEACTIVATED','CONTACT',$2,$3::jsonb)",
              [
                actor.id,
                id,
                JSON.stringify(
                  sanitizeAuditDetails({
                    before: before.rows[0],
                    reason: 'Referenced by retained ticket or change history',
                  }),
                ),
              ],
            );
            await db.query('COMMIT');
            return { id, deleted: false, deactivated: true };
          }
        }
        const dependencyChecks: Partial<Record<Resource, [string, string][]>> =
          {
            clients: [
              ['contacts', 'contacts'],
              ['sites', 'sites'],
              ['assets', 'assets'],
              ['client_users', 'user memberships'],
            ],
            sites: [['assets', 'assets']],
            categories: [['categories', 'child categories']],
            sources: [['tickets', 'tickets']],
          };
        for (const [table, label] of dependencyChecks[resource as Resource] ??
          []) {
          const column =
            resource === 'categories'
              ? 'parent_id'
              : resource === 'sources'
                ? 'source'
                : 'client_id';
          const dependency = await db.query(
            `SELECT 1 FROM ${table} WHERE ${column}=$1 LIMIT 1`,
            [id],
          );
          if (dependency.rowCount)
            throw new ConflictException(
              `This record cannot be deleted while ${label} are linked to it`,
            );
        }
        await db.query(`DELETE FROM ${config.table} WHERE ${idColumn}=$1`, [
          id,
        ]);
        await db.query(
          'INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5::jsonb)',
          [
            actor.id,
            `${config.type}.DELETED`,
            config.type,
            id,
            JSON.stringify(sanitizeAuditDetails({ before: before.rows[0] })),
          ],
        );
      }
      await db.query('COMMIT');
      return { id, deleted: true };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
}
@ApiTags('Administration')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AuthService,
    private readonly admin: AdminService,
  ) {}
  private async resourceUser(request: FastifyRequest, resource: string) {
    const permissions: Record<string, string> = {
      categories: 'CATEGORY_MANAGE',
      clients: 'CLIENTS_MANAGE',
      contacts: 'CONTACTS_MANAGE',
      sites: 'SITES_MANAGE',
      tags: 'TAGS_MANAGE',
      'audit-logs': 'AUDIT_VIEW',
      sources: 'SOURCES_MANAGE',
      departments: 'USERS_MANAGE',
    };
    const user = await this.auth.currentUser(request);
    if (
      !user.roles.includes('ADMIN') &&
      (!permissions[resource] ||
        !this.auth.hasPermission(user, permissions[resource]))
    )
      throw new ForbiddenException();
    return user;
  }
  @Get('overview') async overview(@Req() request: FastifyRequest) {
    await this.auth.requireRoles(request, ['ADMIN']);
    return this.admin.overview();
  }
  @Get(':resource') async list(
    @Req() request: FastifyRequest,
    @Param('resource') resource: string,
    @Query() query: AdminQuery,
  ) {
    const user = await this.resourceUser(request, resource);
    return this.admin.list(resource, query, user.roles.includes('ADMIN'));
  }
  @Patch('users/:id') async access(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateAccessDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.admin.updateAccess(
      id,
      body,
      await this.auth.requireRoles(request, ['ADMIN']),
    );
  }
  @Patch(':resource/:id') async update(
    @Req() request: FastifyRequest,
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    await this.auth.verifyCsrf(request);
    return this.admin.updateRecord(
      resource,
      id,
      body,
      await this.resourceUser(request, resource),
    );
  }
  @Delete('users/:id') async deleteUser(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: DeleteConfirmationDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.admin.deleteRecord(
      'users',
      id,
      body.confirmation,
      await this.auth.requireRoles(request, ['ADMIN']),
    );
  }
  @Delete(':resource/:id') async delete(
    @Req() request: FastifyRequest,
    @Param('resource') resource: string,
    @Param('id') id: string,
    @Body() body: DeleteConfirmationDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.admin.deleteRecord(
      resource,
      id,
      body.confirmation,
      await this.resourceUser(request, resource),
    );
  }
}
