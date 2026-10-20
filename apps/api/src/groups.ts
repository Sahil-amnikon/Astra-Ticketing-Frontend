import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
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
  MinLength,
} from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth';
import { Dependencies } from './dependencies';
import { changeTransaction } from './change-governance-rules';

import {
  STAFF_GROUP_PERMISSIONS,
  CUSTOMER_GROUP_PERMISSIONS,
} from './group-permissions';
export class GroupQuery {
  @IsOptional() @IsString() @MaxLength(120) q = '';
  @IsOptional() @IsIn(['ALL', 'CUSTOMER', 'STAFF']) kind = 'ALL';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}
export class GroupDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description = '';
  @IsIn(['CUSTOMER', 'STAFF']) kind!: 'CUSTOMER' | 'STAFF';
  @IsOptional() @IsUUID() clientId?: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsIn([...STAFF_GROUP_PERMISSIONS, ...CUSTOMER_GROUP_PERMISSIONS], {
    each: true,
  })
  permissions!: string[];
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  memberIds!: string[];
  @IsBoolean() active!: boolean;
  @IsOptional() @IsInt() @Min(1) revision?: number;
}
@Injectable()
export class GroupService {
  constructor(private readonly deps: Dependencies) {}
  async options() {
    const [clients, users, contacts, permissions] = await Promise.all([
      this.deps.db.query(
        "SELECT id,name FROM clients WHERE status='ACTIVE' AND organization_type='CLIENT' ORDER BY name",
      ),
      this.deps.db.query(
        'SELECT u.id,u.display_name AS name,u.email FROM users u WHERE u.active AND EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_code=ANY($1::text[])) ORDER BY u.display_name',
        [['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN']],
      ),
      this.deps.db.query(
        "SELECT c.id,c.name,c.email,c.client_id,c.user_id FROM contacts c JOIN clients cl ON cl.id=c.client_id WHERE c.active AND cl.status='ACTIVE' AND cl.organization_type='CLIENT' ORDER BY c.name",
      ),
      this.deps.db.query(
        'SELECT code,name,description FROM permissions WHERE code=ANY($1::text[]) ORDER BY name',
        [STAFF_GROUP_PERMISSIONS],
      ),
    ]);
    return {
      clients: clients.rows,
      users: users.rows,
      contacts: contacts.rows,
      staffPermissions: permissions.rows,
      customerPermissions: [
        {
          code: 'PORTAL_ORGANIZATION_VIEW',
          name: 'View organization tickets',
          description:
            'Read tickets and public attachments for the selected customer organization in the authenticated client workspace.',
        },
        {
          code: 'PORTAL_ORGANIZATION_REPLY',
          name: 'Reply to organization tickets',
          description:
            'Add public replies and attachments to organization tickets. Requires view permission.',
        },
      ],
    };
  }
  async list(query: GroupQuery) {
    const pattern = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
    const r = await this.deps.db.query(
      `WITH visible AS (
      SELECT g.*,c.name AS client_name,
        CASE WHEN g.kind='STAFF' THEN (SELECT count(*)::int FROM staff_group_members m WHERE m.group_id=g.id)
          ELSE (SELECT count(*)::int FROM customer_group_members m WHERE m.group_id=g.id) END member_count
      FROM access_groups g LEFT JOIN clients c ON c.id=g.client_id
      WHERE ($1='ALL' OR g.kind=$1) AND ($2='' OR g.name ILIKE $3 OR c.name ILIKE $3)
    ) SELECT (SELECT count(*)::int FROM visible) total,
      COALESCE((SELECT jsonb_agg(r) FROM (SELECT * FROM visible ORDER BY lower(name),id LIMIT 20 OFFSET $4) r),'[]') items`,
      [query.kind, query.q, pattern, (query.page - 1) * 20],
    );
    return { ...r.rows[0], page: query.page, pageSize: 20 };
  }
  async detail(id: string) {
    const row = (
      await this.deps.db.query(
        `SELECT g.*,ARRAY(SELECT user_id::text FROM staff_group_members WHERE group_id=g.id) staff_members,
      ARRAY(SELECT contact_id::text FROM customer_group_members WHERE group_id=g.id) customer_members FROM access_groups g WHERE id=$1`,
        [id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException();
    return row;
  }
  async save(dto: GroupDto, actorId: string, id?: string) {
    const name = dto.name.trim();
    if (name.length < 2)
      throw new BadRequestException(
        'Enter a group name with at least two characters.',
      );
    const allowed =
      dto.kind === 'STAFF'
        ? STAFF_GROUP_PERMISSIONS
        : CUSTOMER_GROUP_PERMISSIONS;
    if (dto.permissions.some((p) => !allowed.includes(p)))
      throw new BadRequestException(
        'Choose permissions matching the group type.',
      );
    if (
      dto.permissions.includes('PORTAL_ORGANIZATION_REPLY') &&
      !dto.permissions.includes('PORTAL_ORGANIZATION_VIEW')
    )
      throw new BadRequestException(
        'Organization replies require organization view permission.',
      );
    if (
      (dto.kind === 'CUSTOMER' && !dto.clientId) ||
      (dto.kind === 'STAFF' && dto.clientId)
    )
      throw new BadRequestException(
        'Only customer groups require a customer organization.',
      );
    return changeTransaction(this.deps, async (db) => {
      const before = id
        ? (
            await db.query(
              'SELECT * FROM access_groups WHERE id=$1 FOR UPDATE',
              [id],
            )
          ).rows[0]
        : null;
      if (id && !before) throw new NotFoundException();
      if (
        before &&
        (before.kind !== dto.kind ||
          before.client_id !== (dto.clientId ?? null))
      )
        throw new BadRequestException(
          'Group type and customer cannot be changed. Create another group.',
        );
      if (before && dto.revision !== before.revision)
        throw new BadRequestException(
          'This group changed. Reload it before saving.',
        );
      if (
        dto.kind === 'CUSTOMER' &&
        !(
          await db.query(
            "SELECT id FROM clients WHERE id=$1 AND status='ACTIVE' AND organization_type='CLIENT' FOR SHARE",
            [dto.clientId],
          )
        ).rowCount
      )
        throw new BadRequestException(
          'Choose an active customer organization.',
        );
      const ids = [...new Set(dto.memberIds)];
      if (ids.length) {
        const valid =
          dto.kind === 'CUSTOMER'
            ? await db.query(
                'SELECT id FROM contacts WHERE id=ANY($1::uuid[]) AND client_id=$2 AND active FOR SHARE',
                [ids, dto.clientId],
              )
            : await db.query(
                'SELECT u.id FROM users u WHERE u.id=ANY($1::uuid[]) AND u.active AND EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_code=ANY($2::text[])) FOR SHARE OF u',
                [ids, ['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN']],
              );
        if (valid.rowCount !== ids.length)
          throw new BadRequestException(
            dto.kind === 'CUSTOMER'
              ? 'Choose active contacts from this customer.'
              : 'Choose active staff accounts with staff roles.',
          );
      }
      const values = [
        name,
        dto.description.trim(),
        dto.kind,
        dto.clientId ?? null,
        dto.permissions,
        dto.active,
      ];
      const group = (
        await db.query(
          id
            ? 'UPDATE access_groups SET name=$1,description=$2,kind=$3,client_id=$4,permissions=$5,active=$6,revision=revision+1,updated_at=now() WHERE id=$7 RETURNING *'
            : 'INSERT INTO access_groups(name,description,kind,client_id,permissions,active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          id ? [...values, id] : values,
        )
      ).rows[0];
      const priorMembers = (
        await db.query(
          dto.kind === 'STAFF'
            ? 'SELECT user_id AS id FROM staff_group_members WHERE group_id=$1'
            : 'SELECT contact_id AS id FROM customer_group_members WHERE group_id=$1',
          [group.id],
        )
      ).rows.map((m) => m.id);
      await db.query(
        dto.kind === 'STAFF'
          ? 'DELETE FROM staff_group_members WHERE group_id=$1'
          : 'DELETE FROM customer_group_members WHERE group_id=$1',
        [group.id],
      );
      for (const member of ids)
        await db.query(
          dto.kind === 'STAFF'
            ? 'INSERT INTO staff_group_members(group_id,user_id) VALUES($1,$2)'
            : 'INSERT INTO customer_group_members(group_id,contact_id,client_id) VALUES($1,$2,$3)',
          dto.kind === 'STAFF'
            ? [group.id, member]
            : [group.id, member, dto.clientId],
        );
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'ACCESS_GROUP',$3,$4::jsonb)",
        [
          actorId,
          id ? 'GROUP.UPDATED' : 'GROUP.CREATED',
          group.id,
          JSON.stringify({
            name,
            kind: dto.kind,
            clientId: dto.clientId ?? null,
            before: before
              ? {
                  permissions: before.permissions,
                  active: before.active,
                  memberIds: priorMembers,
                }
              : null,
            after: {
              permissions: dto.permissions,
              active: dto.active,
              memberIds: ids,
            },
          }),
        ],
      );
      return group;
    });
  }
}
@Controller('admin/groups')
export class GroupController {
  constructor(
    private readonly auth: AuthService,
    private readonly groups: GroupService,
  ) {}
  @Get('options') async options(@Req() r: FastifyRequest) {
    await this.auth.requireRoles(r, ['ADMIN']);
    return this.groups.options();
  }
  @Get() async list(@Req() r: FastifyRequest, @Query() q: GroupQuery) {
    await this.auth.requireRoles(r, ['ADMIN']);
    return this.groups.list(q);
  }
  @Get(':id') async detail(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.auth.requireRoles(r, ['ADMIN']);
    return this.groups.detail(id);
  }
  @Post() async create(@Req() r: FastifyRequest, @Body() dto: GroupDto) {
    await this.auth.verifyCsrf(r);
    const actor = await this.auth.requireRoles(r, ['ADMIN']);
    return this.groups.save(dto, actor.id);
  }
  @Patch(':id') async update(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: GroupDto,
  ) {
    await this.auth.verifyCsrf(r);
    const actor = await this.auth.requireRoles(r, ['ADMIN']);
    return this.groups.save(dto, actor.id, id);
  }
}
