import {
  ArrayNotEmpty,
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Post,
  Patch,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { AuthService, AuthenticatedUser } from './auth';
import { readConfig } from './config';
import { Dependencies } from './dependencies';
import { EntraDirectoryService } from './entra-directory';
import { PERMISSION_CODES, permissionsForRoles } from './access';

const STAFF_ROLES = ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'];
const ROLE_CODES = ['USER', ...STAFF_ROLES];

class ClientScopeQuery {
  @IsOptional()
  @IsUUID()
  clientId?: string;
}

export class CreateClientDto {
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'Name cannot be blank' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Matches(/^[A-Z][A-Z0-9]{1,7}$/, {
    message: 'Ticket prefix must be 2-8 uppercase letters or numbers',
  })
  ticketPrefix?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  primaryEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  primaryPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class CreateUserDto {
  @IsUUID()
  entraObjectId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1)
  @IsIn(ROLE_CODES, { each: true })
  roles!: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  clientIds!: string[];

  @IsArray()
  @IsUUID(undefined, { each: true })
  siteIds?: string[] = [];

  @IsArray()
  @IsIn(PERMISSION_CODES, { each: true })
  permissions?: string[] = [];

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

export class ResolveEntraUserDto {
  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'Enter a name, work email or Entra UPN' })
  identifier!: string;
}

export class CreateContactDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'Name cannot be blank' })
  name!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;
}

export class CreateSiteDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'Name cannot be blank' })
  name!: string;
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[A-Z][A-Z0-9]{1,15}$/)
  ticketPrefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string;
}

export class CreateAssetDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'Name cannot be blank' })
  name!: string;

  @IsString()
  @MaxLength(100)
  @Matches(/\S/)
  assetType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalReference?: string;
}

export class CreateCategoryDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @MaxLength(200)
  @Matches(/\S/, { message: 'Name cannot be blank' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class CreateTagDto {
  @IsString()
  @MaxLength(100)
  @Matches(/\S/, { message: 'Name cannot be blank' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class TicketSourceDto {
  @IsString()
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Code must use uppercase letters, numbers and underscores',
  })
  code!: string;

  @IsString()
  @MaxLength(100)
  @Matches(/\S/)
  name!: string;
}

export class UpdateTicketSourceDto {
  @IsString() @MaxLength(100) @Matches(/\S/) name!: string;
  @IsIn([true, false]) active!: boolean;
}

@Injectable()
export class CoreService {
  private readonly config = readConfig();

  constructor(
    private readonly dependencies: Dependencies,
    private readonly directory: EntraDirectoryService,
  ) {}

  private permittedClientIds(
    user: AuthenticatedUser,
    requested?: string,
  ): string[] | null {
    if (user.roles.includes('ADMIN')) return requested ? [requested] : null;
    if (requested && !user.clientIds.includes(requested)) return [];
    return requested ? [requested] : user.clientIds;
  }

  private async audit(
    client: PoolClient,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit_logs
         (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [actorId, action, entityType, entityId, JSON.stringify(details)],
    );
  }

  async roles() {
    const result = await this.dependencies.db.query(
      'SELECT code, name, description FROM roles ORDER BY code',
    );
    return result.rows;
  }

  async permissions() {
    const result = await this.dependencies.db.query(
      'SELECT code,name,description FROM permissions ORDER BY name',
    );
    return result.rows;
  }

  async ticketSources(activeOnly = false) {
    const result = await this.dependencies.db.query(
      `SELECT code,name,active,sort_order FROM ticket_sources
       WHERE (NOT $1::boolean OR active) ORDER BY sort_order,name`,
      [activeOnly],
    );
    return result.rows;
  }

  async createTicketSource(dto: TicketSourceDto, actor: AuthenticatedUser) {
    const result = await this.dependencies.db.query(
      `INSERT INTO ticket_sources(code,name) VALUES($1,$2) RETURNING code`,
      [dto.code.trim(), dto.name.trim()],
    );
    await this.dependencies.db.query(
      `INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details)
       VALUES($1,'TICKET_SOURCE.CREATED','TICKET_SOURCE',$2,$3::jsonb)`,
      [actor.id, dto.code.trim(), JSON.stringify({ name: dto.name.trim() })],
    );
    return result.rows[0];
  }

  async updateTicketSource(
    code: string,
    dto: UpdateTicketSourceDto,
    actor: AuthenticatedUser,
  ) {
    const result = await this.dependencies.db.query(
      `UPDATE ticket_sources SET name=$2,active=$3,updated_at=now()
       WHERE code=$1 RETURNING code`,
      [code, dto.name.trim(), dto.active],
    );
    if (!result.rows[0]) throw new BadRequestException('Unknown ticket source');
    await this.dependencies.db.query(
      `INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details)
       VALUES($1,'TICKET_SOURCE.UPDATED','TICKET_SOURCE',$2,$3::jsonb)`,
      [actor.id, code, JSON.stringify(dto)],
    );
    return result.rows[0];
  }

  async users() {
    const result = await this.dependencies.db.query(
      `SELECT u.id, u.email, u.display_name, u.active, u.last_login_at,u.work_scope,u.change_access,u.supervisor_user_id,
         COALESCE(array_agg(DISTINCT ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), '{}') AS roles,
         COALESCE(array_agg(DISTINCT cu.client_id::text) FILTER (WHERE cu.client_id IS NOT NULL), '{}') AS client_ids,
         ARRAY(SELECT site_id::text FROM user_sites WHERE user_id=u.id) AS site_ids,
         ARRAY(SELECT permission_code FROM user_permissions WHERE user_id=u.id) AS permissions,
         ARRAY(SELECT department_id::text FROM department_users WHERE user_id=u.id) AS department_ids,
         ARRAY(SELECT department_id::text FROM department_users WHERE user_id=u.id AND is_lead) AS lead_department_ids
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN client_users cu ON cu.user_id = u.id
       GROUP BY u.id ORDER BY u.display_name`,
    );
    return result.rows;
  }

  async resolveEntraUser(identifier: string) {
    return { items: await this.directory.search(identifier) };
  }

  async createUser(dto: CreateUserDto, actor: AuthenticatedUser) {
    const internalId = '00000000-0000-4000-8000-000000000132';
    const externalClientIds = dto.clientIds.filter((id) => id !== internalId);
    if (dto.roles.includes('USER') && externalClientIds.length === 0) {
      throw new BadRequestException('Client users require client membership');
    }
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
    const directoryUser = await this.directory.findById(dto.entraObjectId);
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO users
          (entra_object_id, entra_tenant_id, email, display_name,work_scope,change_access,supervisor_user_id,access_expires_at)
         VALUES ($1, $2, $3, $4,$5,$6,$7,NULL) RETURNING id`,
        [
          dto.entraObjectId,
          this.config.ENTRA_TENANT_ID,
          directoryUser.email,
          directoryUser.displayName,
          workScope,
          changeAccess,
          dto.supervisorUserId ?? null,
        ],
      );
      const id = inserted.rows[0]?.id;
      if (!id) throw new Error('User insert failed');
      for (const role of new Set(dto.roles)) {
        await db.query(
          `INSERT INTO user_roles (user_id, role_code, granted_by)
           VALUES ($1, $2, $3)`,
          [id, role, actor.id],
        );
      }
      for (const clientId of effectiveClientIds) {
        await db.query(
          'INSERT INTO client_users (client_id, user_id) VALUES ($1, $2)',
          [clientId, id],
        );
      }
      for (const siteId of new Set(dto.siteIds ?? [])) {
        const insertedSite = await db.query(
          `INSERT INTO user_sites(user_id,site_id)
           SELECT $1,s.id FROM sites s WHERE s.id=$2 AND s.client_id=ANY($3::uuid[])`,
          [id, siteId, effectiveClientIds],
        );
        if (!insertedSite.rowCount)
          throw new BadRequestException(
            'Site access must belong to an assigned client',
          );
      }
      const permissions = permissionsForRoles(dto.roles);
      for (const permission of permissions)
        await db.query(
          'INSERT INTO user_permissions(user_id,permission_code,granted_by) VALUES($1,$2,$3)',
          [id, permission, actor.id],
        );
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
      await this.audit(db, actor.id, 'USER.CREATED', 'USER', id, {
        roles: dto.roles,
        clientIds: effectiveClientIds,
        workScope,
        changeAccess,
        siteIds: dto.siteIds,
        permissions,
      });
      await db.query('COMMIT');
      return { id };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async clients(user: AuthenticatedUser) {
    const ids = this.permittedClientIds(user);
    const result = await this.dependencies.db.query(
      `SELECT id, name, ticket_prefix, status, primary_email, primary_phone, notes,
              created_at, updated_at
       FROM clients
       WHERE ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
       ORDER BY name`,
      [ids],
    );
    return result.rows;
  }

  async createClient(dto: CreateClientDto, actor: AuthenticatedUser) {
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const base =
        dto.ticketPrefix?.trim().toUpperCase() ||
        dto.name
          .replace(/[^a-z0-9]/gi, '')
          .slice(0, 3)
          .toUpperCase() ||
        'CLT';
      let prefix = base.length >= 2 ? base : `${base}X`;
      if (!dto.ticketPrefix) {
        let suffix = 2;
        while (
          (
            await db.query(
              'SELECT 1 FROM ticket_prefix_registry WHERE prefix=$1',
              [prefix],
            )
          ).rowCount
        ) {
          prefix = `${base.slice(0, 6)}${suffix++}`;
        }
      }
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO clients (name,ticket_prefix,primary_email,primary_phone,notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          dto.name.trim(),
          prefix,
          dto.primaryEmail,
          dto.primaryPhone,
          dto.notes,
        ],
      );
      const id = inserted.rows[0]?.id;
      if (!id) throw new Error('Client insert failed');
      await db.query(
        'INSERT INTO client_ticket_sequences(client_id,next_number) VALUES($1,1)',
        [id],
      );
      await this.audit(db, actor.id, 'CLIENT.CREATED', 'CLIENT', id, {
        name: dto.name.trim(),
        ticketPrefix: prefix,
      });
      await db.query('COMMIT');
      return { id };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async contacts(user: AuthenticatedUser, clientId?: string) {
    return this.clientScopedList(
      user,
      clientId,
      `SELECT id, client_id, site_id, user_id, name, email, phone, active,
              created_at, updated_at
       FROM contacts`,
      'name',
    );
  }

  async createContact(dto: CreateContactDto, actor: AuthenticatedUser) {
    if (dto.siteId) {
      const site = await this.dependencies.db.query(
        'SELECT 1 FROM sites WHERE id=$1 AND client_id=$2 AND active',
        [dto.siteId, dto.clientId],
      );
      if (!site.rowCount)
        throw new BadRequestException(
          'Site does not belong to the selected organization',
        );
    }
    return this.insertAndAudit(
      actor,
      `INSERT INTO contacts (client_id,site_id,name,email,phone)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [dto.clientId, dto.siteId ?? null, dto.name.trim(), dto.email, dto.phone],
      'CONTACT',
      'CONTACT.CREATED',
      { clientId: dto.clientId, siteId: dto.siteId },
    );
  }

  async sites(user: AuthenticatedUser, clientId?: string) {
    return this.clientScopedList(
      user,
      clientId,
      `SELECT id, client_id, name, address, active, created_at, updated_at
       FROM sites`,
      'name',
    );
  }

  async createSite(dto: CreateSiteDto, actor: AuthenticatedUser) {
    return this.insertAndAudit(
      actor,
      `INSERT INTO sites (client_id, name, address,ticket_prefix)
       VALUES ($1, $2, $3,$4) RETURNING id`,
      [dto.clientId, dto.name.trim(), dto.address, dto.ticketPrefix ?? null],
      'SITE',
      'SITE.CREATED',
      { clientId: dto.clientId },
    );
  }

  async assets(user: AuthenticatedUser, clientId?: string) {
    return this.clientScopedList(
      user,
      clientId,
      `SELECT id, client_id, site_id, name, asset_type, serial_number,
              external_reference, active, created_at, updated_at
       FROM assets`,
      'name',
    );
  }

  async createAsset(dto: CreateAssetDto, actor: AuthenticatedUser) {
    return this.insertAndAudit(
      actor,
      `INSERT INTO assets
         (client_id, site_id, name, asset_type, serial_number, external_reference)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        dto.clientId,
        dto.siteId,
        dto.name.trim(),
        dto.assetType.trim(),
        dto.serialNumber,
        dto.externalReference,
      ],
      'ASSET',
      'ASSET.CREATED',
      { clientId: dto.clientId },
    );
  }

  async categories() {
    const result = await this.dependencies.db.query(
      `SELECT id, parent_id, name, description, active, created_at, updated_at
       FROM categories ORDER BY parent_id NULLS FIRST, name`,
    );
    return result.rows;
  }

  async createCategory(dto: CreateCategoryDto, actor: AuthenticatedUser) {
    return this.insertAndAudit(
      actor,
      `INSERT INTO categories (parent_id, name, description)
       VALUES ($1, $2, $3) RETURNING id`,
      [dto.parentId, dto.name.trim(), dto.description],
      'CATEGORY',
      'CATEGORY.CREATED',
    );
  }

  async tags() {
    const result = await this.dependencies.db.query(
      `SELECT id, name, description, active, created_at, updated_at
       FROM tags ORDER BY name`,
    );
    return result.rows;
  }

  async createTag(dto: CreateTagDto, actor: AuthenticatedUser) {
    return this.insertAndAudit(
      actor,
      `INSERT INTO tags (name, description) VALUES ($1, $2) RETURNING id`,
      [dto.name.trim(), dto.description],
      'TAG',
      'TAG.CREATED',
    );
  }

  async auditLogs() {
    const result = await this.dependencies.db.query(
      `SELECT id, actor_user_id, action, entity_type, entity_id, details,
              created_at
       FROM audit_logs ORDER BY id DESC LIMIT 200`,
    );
    return result.rows;
  }

  private async clientScopedList(
    user: AuthenticatedUser,
    requestedClientId: string | undefined,
    selectSql: string,
    orderColumn: 'name',
  ) {
    const ids = this.permittedClientIds(user, requestedClientId);
    const result = await this.dependencies.db.query(
      `${selectSql}
       WHERE ($1::uuid[] IS NULL OR client_id = ANY($1::uuid[]))
       ORDER BY ${orderColumn}`,
      [ids],
    );
    return result.rows;
  }

  private async insertAndAudit(
    actor: AuthenticatedUser,
    sql: string,
    values: unknown[],
    entityType: string,
    action: string,
    details: Record<string, unknown> = {},
  ) {
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const result = await db.query<{ id: string }>(sql, values);
      const id = result.rows[0]?.id;
      if (!id) throw new Error(`${entityType} insert failed`);
      await this.audit(db, actor.id, action, entityType, id, details);
      await db.query('COMMIT');
      return { id };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
}

@ApiTags('Identity and core data')
@Controller()
export class CoreController {
  constructor(
    private readonly auth: AuthService,
    private readonly core: CoreService,
  ) {}

  private async authenticated(request: FastifyRequest) {
    return this.auth.currentUser(request);
  }

  private async administrator(request: FastifyRequest) {
    await this.auth.verifyCsrf(request);
    return this.auth.requireRoles(request, ['ADMIN']);
  }

  private async categoryManager(request: FastifyRequest) {
    await this.auth.verifyCsrf(request);
    return this.auth.requirePermission(request, 'CATEGORY_MANAGE');
  }

  @Get('roles')
  @ApiOperation({ summary: 'List built-in roles' })
  async roles(@Req() request: FastifyRequest) {
    await this.auth.requireRoles(request, ['ADMIN']);
    return this.core.roles();
  }

  @Get('permissions')
  @ApiOperation({ summary: 'List assignable application permissions' })
  async permissions(@Req() request: FastifyRequest) {
    await this.auth.requireRoles(request, ['ADMIN']);
    return this.core.permissions();
  }

  @Get('ticket-sources')
  async ticketSources(@Req() request: FastifyRequest) {
    await this.auth.currentUser(request);
    return this.core.ticketSources(false);
  }

  @Post('ticket-sources')
  async createTicketSource(
    @Req() request: FastifyRequest,
    @Body() body: TicketSourceDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.core.createTicketSource(
      body,
      await this.auth.requirePermission(request, 'SOURCES_MANAGE'),
    );
  }

  @Post('sources')
  async createSourceAlias(
    @Req() request: FastifyRequest,
    @Body() body: TicketSourceDto,
  ) {
    return this.createTicketSource(request, body);
  }

  @Patch('ticket-sources/:code')
  async updateTicketSource(
    @Req() request: FastifyRequest,
    @Param('code') code: string,
    @Body() body: UpdateTicketSourceDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.core.updateTicketSource(
      code,
      body,
      await this.auth.requirePermission(request, 'SOURCES_MANAGE'),
    );
  }

  @Get('users')
  @ApiOperation({ summary: 'List provisioned users' })
  async users(@Req() request: FastifyRequest) {
    await this.auth.requireRoles(request, ['ADMIN']);
    return this.core.users();
  }

  @Post('users')
  @ApiOperation({ summary: 'Provision an Entra user' })
  async createUser(
    @Req() request: FastifyRequest,
    @Body() body: CreateUserDto,
  ) {
    return this.core.createUser(body, await this.administrator(request));
  }

  @Post('users/resolve')
  @ApiOperation({ summary: 'Search Entra users by name, work email or UPN' })
  async resolveUser(
    @Req() request: FastifyRequest,
    @Body() body: ResolveEntraUserDto,
  ) {
    await this.administrator(request);
    return this.core.resolveEntraUser(body.identifier);
  }

  @Get('clients')
  @ApiOperation({ summary: 'List clients permitted for the current user' })
  async clients(@Req() request: FastifyRequest) {
    return this.core.clients(await this.authenticated(request));
  }

  @Post('clients')
  @ApiOperation({ summary: 'Create a client' })
  async createClient(
    @Req() request: FastifyRequest,
    @Body() body: CreateClientDto,
  ) {
    return this.core.createClient(body, await this.administrator(request));
  }

  @Get('contacts')
  async contacts(
    @Req() request: FastifyRequest,
    @Query() query: ClientScopeQuery,
  ) {
    return this.core.contacts(
      await this.authenticated(request),
      query.clientId,
    );
  }

  @Post('contacts')
  async createContact(
    @Req() request: FastifyRequest,
    @Body() body: CreateContactDto,
  ) {
    return this.core.createContact(body, await this.administrator(request));
  }

  @Get('sites')
  async sites(
    @Req() request: FastifyRequest,
    @Query() query: ClientScopeQuery,
  ) {
    return this.core.sites(await this.authenticated(request), query.clientId);
  }

  @Post('sites')
  async createSite(
    @Req() request: FastifyRequest,
    @Body() body: CreateSiteDto,
  ) {
    return this.core.createSite(body, await this.administrator(request));
  }

  @Get('assets')
  async assets(
    @Req() request: FastifyRequest,
    @Query() query: ClientScopeQuery,
  ) {
    return this.core.assets(await this.authenticated(request), query.clientId);
  }

  @Post('assets')
  async createAsset(
    @Req() request: FastifyRequest,
    @Body() body: CreateAssetDto,
  ) {
    return this.core.createAsset(body, await this.administrator(request));
  }

  @Get('categories')
  async categories(@Req() request: FastifyRequest) {
    await this.authenticated(request);
    return this.core.categories();
  }

  @Post('categories')
  async createCategory(
    @Req() request: FastifyRequest,
    @Body() body: CreateCategoryDto,
  ) {
    return this.core.createCategory(body, await this.categoryManager(request));
  }

  @Get('tags')
  async tags(@Req() request: FastifyRequest) {
    await this.authenticated(request);
    return this.core.tags();
  }

  @Post('tags')
  async createTag(@Req() request: FastifyRequest, @Body() body: CreateTagDto) {
    return this.core.createTag(body, await this.administrator(request));
  }

  @Get('audit-logs')
  async auditLogs(@Req() request: FastifyRequest) {
    await this.auth.requireRoles(request, ['ADMIN']);
    return this.core.auditLogs();
  }
}
