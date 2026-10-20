import {
  DASHBOARD_FILTERS,
  dashboardPredicates,
} from './ticket-dashboard-filters';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuthService, AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';
import { enqueueNotification } from './notifications';
import { queueTicketEmail, queueRequesterReply } from './mail-queue';
import {
  deleteStoredTicketAttachment,
  readStoredTicketAttachment,
  storeTicketAttachment,
} from './attachment-storage';

const STAFF_ROLES = [
  'INTERN',
  'TECHNICIAN',
  'TEAM_LEAD',
  'MANAGER',
  'ADMIN',
] as const;
const WIDE_TICKET_ROLES = ['TEAM_LEAD', 'MANAGER', 'ADMIN'] as const;
const STATUSES = [
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_CLIENT',
  'WAITING_FOR_VENDOR',
  'ON_HOLD',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
] as const;
const PRIORITIES = ['P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'] as const;
const SLA_STATES = [
  'NOT_TRACKED',
  'ON_TRACK',
  'AT_RISK',
  'BREACHED',
  'MET',
  'PAUSED',
] as const;
const PAUSED_STATUSES = [
  'WAITING_FOR_CLIENT',
  'WAITING_FOR_VENDOR',
  'ON_HOLD',
] as const;
const pausedStatuses = new Set<string>(PAUSED_STATUSES);
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/gif',
  'image/jpeg',
  'image/png',
  'text/csv',
  'text/plain',
]);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const SEARCH_OPERATORS = new Set([
  'client',
  'status',
  'assigned',
  'priority',
  'source',
  'category',
  'tag',
  'site',
  'sla',
]);

function parseTicketSearch(input: string) {
  const operators: Record<string, string> = {};
  const text = input
    .replace(
      /\b([a-z]+):(?:"([^"]+)"|(\S+))/gi,
      (match, rawKey: string, quoted: string | undefined, plain: string) => {
        const key = rawKey.toLowerCase();
        if (!SEARCH_OPERATORS.has(key)) return match;
        operators[key] = (quoted ?? plain).trim();
        return ' ';
      },
    )
    .replace(/\s+/g, ' ')
    .trim();
  return { text, operators };
}

function searchPattern(value?: string) {
  return `%${(value ?? '').replace(/[\\%_]/g, '\\$&')}%`;
}

function enumOperator<T extends readonly string[]>(
  value: string | undefined,
  choices: T,
) {
  if (!value) return null;
  const normalized = value
    .trim()
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
    .toUpperCase();
  return (
    choices.find(
      (choice) =>
        choice === normalized || choice.replace(/^P\d_/, '') === normalized,
    ) ?? null
  );
}

export class TicketListQuery {
  @IsOptional()
  @IsIn(DASHBOARD_FILTERS)
  dashboardFilter?: (typeof DASHBOARD_FILTERS)[number];
  @IsOptional() @IsString() @MaxLength(500) q = '';
  @IsOptional() @IsIn(['my', 'team', 'internal', 'all', 'unassigned']) scope =
    'my';
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsIn(PRIORITIES) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() tagId?: string;
  @IsOptional() @IsString() @MaxLength(50) source?: string;
  @IsOptional() @IsIn(SLA_STATES) slaStatus?: (typeof SLA_STATES)[number];
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
}

export class SaveTicketViewDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => TicketListQuery)
  query!: TicketListQuery;
}

export class AttachmentDto {
  @IsString() @MinLength(1) @MaxLength(255) fileName!: string;
  @IsString() @MaxLength(200) contentType!: string;
  @IsString() @MinLength(1) contentBase64!: string;
  @IsOptional() @IsIn(['PUBLIC', 'INTERNAL']) visibility?:
    'PUBLIC' | 'INTERNAL';
}

export class CreateTicketDto {
  @IsUUID() clientId!: string;
  @IsUUID() requesterId!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() @MaxLength(500) locationText?: string;
  @IsUUID() categoryId!: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsString() @MinLength(3) @MaxLength(300) subject!: string;
  @IsString() @MinLength(3) @MaxLength(20000) description!: string;
  @IsString() @MaxLength(50) @Matches(/^[A-Z0-9_]+$/) source!: string;
  @IsIn(PRIORITIES) priority!: (typeof PRIORITIES)[number];
  @IsOptional() @IsString() @MaxLength(500) sourceReferenceId?: string;
  @IsOptional() @IsString() @MaxLength(500) sourceConversationId?: string;
  @IsOptional() @IsString() @MaxLength(500) sourceMessageId?: string;
  @IsOptional() @IsString() @MaxLength(2000) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) externalThreadId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID(undefined, { each: true })
  tagIds: string[] = [];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments?: AttachmentDto[] = [];
}

export class CreateRequesterDto {
  @IsUUID() clientId!: string;
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsOptional() @IsEmail() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
}

export class UpdateTicketDto {
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsIn(PRIORITIES) priority?: (typeof PRIORITIES)[number];
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID(undefined, { each: true })
  tagIds?: string[];
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class AssignTicketDto {
  @IsUUID() assignedUserId!: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class TicketCommentDto {
  @IsIn(['PUBLIC', 'INTERNAL']) type!: 'PUBLIC' | 'INTERNAL';
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;
}

export class ApprovalRequestDto {
  @IsString() @MinLength(3) @MaxLength(2000) reason!: string;
}

export class ApprovalDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @IsString() @MinLength(2) @MaxLength(2000) note!: string;
}

@Injectable()
export class TicketService {
  constructor(private readonly dependencies: Dependencies) {}

  async dashboard(user: AuthenticatedUser, all: boolean) {
    const predicates = dashboardPredicates('s');
    const assignee = all ? null : user.id;
    const clientIds = user.clientIds;
    const unrestricted = user.roles.includes('ADMIN');
    const [result, recent, status, priority, source, trend, workload] =
      await Promise.all([
        this.dependencies.db.query(
          `SELECT
        count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED','CANCELLED'))::int AS open,
        count(*) FILTER (WHERE status='NEW')::int AS new,
        count(*) FILTER (WHERE status='IN_PROGRESS')::int AS in_progress,
        count(*) FILTER (WHERE ${predicates.WAITING})::int AS waiting,
        count(*) FILTER (WHERE ${predicates.RESOLVED_RECENTLY})::int AS recently_resolved,
        count(*) FILTER (WHERE ${predicates.PENDING_APPROVAL})::int AS pending_approval,
        count(*) FILTER (WHERE assigned_user_id IS NULL AND status NOT IN ('RESOLVED','CLOSED','CANCELLED'))::int AS unassigned,
        count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED','CANCELLED') AND s.paused_at IS NULL AND now() >= s.resolution_warning_at AND now() < s.resolution_due_at)::int AS sla_at_risk,
        count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED','CANCELLED') AND s.paused_at IS NULL AND now() >= s.resolution_due_at)::int AS sla_breached,
        count(*) FILTER (WHERE ${predicates.AWAITING_FIRST_RESPONSE})::int AS unattended
       FROM tickets t LEFT JOIN ticket_sla s ON s.ticket_id=t.id
       WHERE ($1::uuid IS NULL OR assigned_user_id=$1)
         AND ($3::boolean OR t.client_id=ANY($2::uuid[]))`,
          [assignee, clientIds, unrestricted],
        ),
        this.dependencies.db.query(
          `${this.ticketSelect()} WHERE ($1::uuid IS NULL OR t.assigned_user_id=$1)
           AND ($3::boolean OR t.client_id=ANY($2::uuid[]))
           ORDER BY t.updated_at DESC LIMIT 8`,
          [assignee, clientIds, unrestricted],
        ),
        this.dashboardDistribution('status', assignee, clientIds, unrestricted),
        this.dashboardDistribution(
          'priority',
          assignee,
          clientIds,
          unrestricted,
        ),
        this.dashboardDistribution('source', assignee, clientIds, unrestricted),
        this.dependencies.db.query(
          `SELECT to_char(day,'YYYY-MM-DD') AS day,
            count(t.id) FILTER (WHERE t.created_at>=day AND t.created_at<day+interval '1 day')::int AS created,
            count(t.id) FILTER (WHERE t.resolved_at>=day AND t.resolved_at<day+interval '1 day')::int AS resolved
           FROM generate_series(current_date-13,current_date,interval '1 day') AS days(day)
           LEFT JOIN tickets t ON ($1::uuid IS NULL OR t.assigned_user_id=$1)
             AND ($3::boolean OR t.client_id=ANY($2::uuid[]))
             AND (t.created_at>=day AND t.created_at<day+interval '1 day'
               OR t.resolved_at>=day AND t.resolved_at<day+interval '1 day')
           GROUP BY day ORDER BY day`,
          [assignee, clientIds, unrestricted],
        ),
        all
          ? this.dependencies.db.query(
              `SELECT u.display_name AS name,count(t.id) FILTER (WHERE t.status NOT IN ('RESOLVED','CLOSED','CANCELLED'))::int AS open,
                count(t.id) FILTER (WHERE t.status='RESOLVED' AND t.resolved_at>=now()-interval '30 days')::int AS resolved
               FROM users u JOIN (SELECT DISTINCT user_id FROM user_roles WHERE role_code=ANY($1::text[])) ur ON ur.user_id=u.id
               LEFT JOIN tickets t ON t.assigned_user_id=u.id
                 AND ($3::boolean OR t.client_id=ANY($2::uuid[]))
               WHERE u.active
               GROUP BY u.id,u.display_name ORDER BY open DESC,u.display_name`,
              [STAFF_ROLES, clientIds, unrestricted],
            )
          : Promise.resolve({ rows: [] }),
      ]);
    return {
      counts: result.rows[0],
      recent: recent.rows,
      charts: {
        status: status.rows,
        priority: priority.rows,
        source: source.rows,
        trend: trend.rows,
        workload: workload.rows,
      },
    };
  }

  private dashboardDistribution(
    field: 'status' | 'priority' | 'source',
    assignee: string | null,
    clientIds: string[],
    unrestricted: boolean,
  ) {
    if (field === 'source')
      return this.dependencies.db.query(
        `SELECT COALESCE(s.name,t.source) AS label,count(*)::int AS value
         FROM tickets t LEFT JOIN ticket_sources s ON s.code=t.source
         WHERE ($1::uuid IS NULL OR t.assigned_user_id=$1)
           AND ($3::boolean OR t.client_id=ANY($2::uuid[]))
         GROUP BY COALESCE(s.name,t.source) ORDER BY count(*) DESC`,
        [assignee, clientIds, unrestricted],
      );
    return this.dependencies.db.query(
      `SELECT ${field} AS label,count(*)::int AS value FROM tickets
       WHERE ($1::uuid IS NULL OR assigned_user_id=$1)
         AND ($3::boolean OR client_id=ANY($2::uuid[]))
       GROUP BY ${field} ORDER BY count(*) DESC`,
      [assignee, clientIds, unrestricted],
    );
  }

  async options(user: AuthenticatedUser) {
    const unrestricted = user.roles.includes('ADMIN');
    const [
      clients,
      contacts,
      sites,
      categories,
      tags,
      technicians,
      sources,
      departments,
    ] = await Promise.all([
      this.dependencies.db.query(
        "SELECT id,name FROM clients WHERE status='ACTIVE' AND ($2::boolean OR id=ANY($1::uuid[])) ORDER BY name",
        [user.clientIds, unrestricted],
      ),
      this.dependencies.db.query(
        'SELECT id,client_id,name,email FROM contacts WHERE active AND ($2::boolean OR client_id=ANY($1::uuid[])) ORDER BY name',
        [user.clientIds, unrestricted],
      ),
      this.dependencies.db.query(
        `SELECT id,client_id,name FROM sites WHERE active
           AND ($2::boolean OR (client_id=ANY($1::uuid[]) AND (cardinality($3::uuid[])=0 OR id=ANY($3::uuid[])))) ORDER BY name`,
        [user.clientIds, unrestricted, user.siteIds ?? []],
      ),
      this.dependencies.db.query(
        `SELECT c.id,c.parent_id,
             CASE WHEN p.name IS NULL THEN c.name ELSE p.name || ' → ' || c.name END AS name
           FROM categories c LEFT JOIN categories p ON p.id=c.parent_id
           WHERE c.active ORDER BY COALESCE(p.name,c.name),p.name NULLS FIRST,c.name`,
      ),
      this.dependencies.db.query(
        'SELECT id,name FROM tags WHERE active ORDER BY name',
      ),
      this.dependencies.db.query(
        `SELECT DISTINCT u.id,u.display_name AS name,u.email FROM users u
           JOIN user_roles ur ON ur.user_id=u.id
           WHERE u.active AND ur.role_code=ANY($1::text[])
             AND ($3::boolean OR EXISTS(SELECT 1 FROM client_users cu WHERE cu.user_id=u.id AND cu.client_id=ANY($2::uuid[])))
           ORDER BY u.display_name`,
        [STAFF_ROLES, user.clientIds, unrestricted],
      ),
      this.dependencies.db.query(
        'SELECT code,name FROM ticket_sources WHERE active ORDER BY sort_order,name',
      ),
      this.dependencies.db.query(
        'SELECT id,name FROM departments WHERE active ORDER BY name',
      ),
    ]);
    return {
      clients: clients.rows,
      contacts: contacts.rows,
      sites: sites.rows,
      categories: categories.rows,
      tags: tags.rows,
      technicians: technicians.rows,
      sources: sources.rows,
      departments: departments.rows,
      statuses: STATUSES,
      priorities: PRIORITIES,
    };
  }

  async createRequester(dto: CreateRequesterDto, actor: AuthenticatedUser) {
    if (
      !actor.roles.includes('ADMIN') &&
      !actor.clientIds.includes(dto.clientId)
    )
      throw new ForbiddenException();
    if (!dto.email?.trim() && !dto.phone?.trim())
      throw new BadRequestException('Requester email or phone is required');
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const client = await db.query(
        "SELECT 1 FROM clients WHERE id=$1 AND status='ACTIVE' FOR UPDATE",
        [dto.clientId],
      );
      if (!client.rowCount) throw new BadRequestException('Invalid client');
      if (dto.email?.trim()) {
        const duplicate = await db.query(
          'SELECT 1 FROM contacts WHERE client_id=$1 AND lower(email)=lower($2) AND active',
          [dto.clientId, dto.email.trim()],
        );
        if (duplicate.rowCount)
          throw new BadRequestException(
            'A requester with this email already exists',
          );
      }
      const result = await db.query<{ id: string }>(
        `INSERT INTO contacts(client_id,name,email,phone,active)
         VALUES($1,$2,$3,$4,true) RETURNING id`,
        [
          dto.clientId,
          dto.name.trim(),
          dto.email?.trim() || null,
          dto.phone?.trim() || null,
        ],
      );
      const id = result.rows[0]?.id;
      if (!id) throw new BadRequestException('Requester could not be created');
      await this.audit(
        db,
        actor.id,
        'CONTACT.CREATED',
        id,
        { clientId: dto.clientId, name: dto.name.trim() },
        'CONTACT',
      );
      await db.query('COMMIT');
      return {
        id,
        client_id: dto.clientId,
        name: dto.name.trim(),
        email: dto.email?.trim() || null,
      };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async list(user: AuthenticatedUser, query: TicketListQuery) {
    const wide = this.hasWideAccess(user);
    const team = this.hasPermission(user, 'TICKETS_TEAM_VIEW');
    if (
      (query.scope === 'team' && !team) ||
      (query.scope === 'internal' &&
        !['INTERNAL', 'BOTH', 'ALL'].includes(user.workScope ?? 'CLIENT')) ||
      (['all', 'unassigned'].includes(query.scope) && !wide)
    )
      throw new ForbiddenException();
    if (query.from && query.to && new Date(query.from) > new Date(query.to))
      throw new BadRequestException('From date must be before To date');
    const parsed = parseTicketSearch(query.q);
    const status =
      query.status ?? enumOperator(parsed.operators.status, STATUSES);
    const priority =
      query.priority ?? enumOperator(parsed.operators.priority, PRIORITIES);
    const slaStatus =
      query.slaStatus ?? enumOperator(parsed.operators.sla, SLA_STATES);
    if (parsed.operators.status && !status)
      throw new BadRequestException('Unknown status search operator value');
    if (parsed.operators.priority && !priority)
      throw new BadRequestException('Unknown priority search operator value');
    if (parsed.operators.sla && !slaStatus)
      throw new BadRequestException('Unknown SLA search operator value');
    const values: unknown[] = [
      parsed.text,
      searchPattern(parsed.text),
      user.id,
      query.scope,
      status,
      priority,
      query.clientId ?? null,
      query.pageSize,
      (query.page - 1) * query.pageSize,
      user.clientIds,
      user.siteIds ?? [],
      user.roles.includes('ADMIN'),
      searchPattern(parsed.operators.client),
      searchPattern(parsed.operators.assigned),
      searchPattern(parsed.operators.category),
      searchPattern(parsed.operators.source),
      searchPattern(parsed.operators.tag),
      searchPattern(parsed.operators.site),
      slaStatus,
      query.from ?? null,
      query.to ?? null,
      query.assignedUserId ?? null,
      query.categoryId ?? null,
      query.source ?? null,
      query.tagId ?? null,
      query.siteId ?? null,
    ];
    const metricPredicates = dashboardPredicates('sla');
    const metricCases = DASHBOARD_FILTERS.map(
      (metric) => `WHEN '${metric}' THEN (${metricPredicates[metric]})`,
    ).join(' ');
    const where = `WHERE ($1='' OR to_tsvector('simple',
          coalesce(t.ticket_number,'') || ' ' || coalesce(t.subject,'') || ' ' ||
          coalesce(t.description,'') || ' ' || coalesce(t.source,''))
        @@ websearch_to_tsquery('simple',$1)
        OR t.ticket_number ILIKE $2 OR t.subject ILIKE $2 OR t.description ILIKE $2
        OR c.name ILIKE $2 OR r.name ILIKE $2 OR r.email ILIKE $2
        OR u.display_name ILIKE $2 OR src.name ILIKE $2 OR cat.name ILIKE $2 OR parentcat.name ILIKE $2
        OR EXISTS(SELECT 1 FROM ticket_comments search_comment WHERE search_comment.ticket_id=t.id AND search_comment.body ILIKE $2)
        OR EXISTS(SELECT 1 FROM ticket_tags search_tt JOIN tags search_tag ON search_tag.id=search_tt.tag_id
          WHERE search_tt.ticket_id=t.id AND search_tag.name ILIKE $2))
      AND ($4='all' OR ($4='my' AND (t.assigned_user_id=$3 OR EXISTS(SELECT 1 FROM ticket_collaborators own_tc WHERE own_tc.ticket_id=t.id AND own_tc.user_id=$3)))
        OR ($4='team' AND (cardinality($11::uuid[])=0 OR t.site_id=ANY($11::uuid[])))
        OR ($4='internal' AND t.client_id='00000000-0000-4000-8000-000000000132'::uuid AND (cardinality($27::uuid[])=0 OR t.department_id=ANY($27::uuid[])))
        OR ($4='unassigned' AND t.assigned_user_id IS NULL))
      AND ($5::text IS NULL OR t.status=$5)
      AND ($6::text IS NULL OR t.priority=$6)
      AND ($7::uuid IS NULL OR t.client_id=$7)
      AND ($12::boolean OR t.client_id=ANY($10::uuid[]))
      AND ($13='%%' OR c.name ILIKE $13)
      AND ($14='%%' OR COALESCE(u.display_name,'Unassigned') ILIKE $14)
      AND ($15='%%' OR cat.name ILIKE $15 OR parentcat.name ILIKE $15)
      AND ($16='%%' OR t.source ILIKE $16 OR src.name ILIKE $16)
      AND ($17='%%' OR EXISTS(SELECT 1 FROM ticket_tags operator_tt JOIN tags operator_tag ON operator_tag.id=operator_tt.tag_id
        WHERE operator_tt.ticket_id=t.id AND operator_tag.name ILIKE $17))
      AND ($18='%%' OR s.name ILIKE $18)
      AND ($19::text IS NULL OR (CASE WHEN sla.resolution_due_at IS NULL OR t.status='CANCELLED' THEN 'NOT_TRACKED'
        WHEN sla.resolution_completed_at IS NOT NULL AND sla.resolution_completed_at<=sla.resolution_due_at THEN 'MET'
        WHEN sla.paused_at IS NOT NULL THEN 'PAUSED'
        WHEN COALESCE(sla.resolution_completed_at,now())>=sla.resolution_due_at THEN 'BREACHED'
        WHEN now()>=sla.resolution_warning_at THEN 'AT_RISK' ELSE 'ON_TRACK' END)=$19)
      AND ($20::timestamptz IS NULL OR t.created_at >= $20)
      AND ($21::timestamptz IS NULL OR t.created_at < $21 + interval '1 day')
      AND ($22::uuid IS NULL OR t.assigned_user_id=$22)
      AND ($23::uuid IS NULL OR t.category_id=$23 OR cat.parent_id=$23)
      AND ($24::text IS NULL OR t.source=$24)
      AND ($25::uuid IS NULL OR EXISTS(SELECT 1 FROM ticket_tags filter_tt WHERE filter_tt.ticket_id=t.id AND filter_tt.tag_id=$25))
      AND ($26::uuid IS NULL OR t.site_id=$26)
      AND ($28::text IS NULL OR CASE $28::text ${metricCases} ELSE false END)
      AND ($28::text IS NULL OR $4<>'my' OR t.assigned_user_id=$3)`;
    values.push(user.departmentIds ?? [], query.dashboardFilter ?? null);
    const result = await this.dependencies.db.query(
      `WITH filtered AS (${this.ticketSelect()} ${where})
       SELECT (SELECT count(*)::int FROM filtered) AS total,
       COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM filtered ORDER BY updated_at DESC LIMIT $8 OFFSET $9) x),'[]'::jsonb) AS items`,
      values,
    );
    return { ...result.rows[0], page: query.page, pageSize: query.pageSize };
  }

  async savedViews(user: AuthenticatedUser) {
    const result = await this.dependencies.db.query(
      `SELECT id,name,query,created_at,updated_at FROM saved_ticket_views
       WHERE user_id=$1 ORDER BY lower(name),id`,
      [user.id],
    );
    return result.rows;
  }

  async saveView(dto: SaveTicketViewDto, user: AuthenticatedUser) {
    const stored = this.savedViewQuery(dto.query);
    const result = await this.dependencies.db.query<{ id: string }>(
      `INSERT INTO saved_ticket_views(user_id,name,query)
       VALUES($1,$2,$3::jsonb)
       ON CONFLICT DO UPDATE SET query=excluded.query,updated_at=now()
       RETURNING id`,
      [user.id, dto.name.trim(), JSON.stringify(stored)],
    );
    return { id: result.rows[0]?.id, name: dto.name.trim(), query: stored };
  }

  async deleteView(id: string, user: AuthenticatedUser) {
    const result = await this.dependencies.db.query(
      'DELETE FROM saved_ticket_views WHERE id=$1 AND user_id=$2',
      [id, user.id],
    );
    if (!result.rowCount) throw new NotFoundException();
    return { id, deleted: true };
  }

  async create(
    dto: CreateTicketDto,
    actor: AuthenticatedUser,
    transaction?: PoolClient,
  ) {
    return this.createRecord(dto, actor, transaction);
  }

  // Only the verified-mailbox service calls this method; it is not an HTTP route.
  async createVerifiedPortalTicket(
    dto: CreateTicketDto,
    transaction: PoolClient,
  ) {
    if (
      dto.source !== 'CLIENT_PORTAL' ||
      dto.priority !== 'P3_MEDIUM' ||
      dto.assignedUserId ||
      dto.departmentId ||
      dto.tagIds.length ||
      dto.attachments?.length
    )
      throw new BadRequestException('Invalid support portal ticket');
    return this.createRecord(
      dto,
      { id: null, roles: ['USER'], clientIds: [dto.clientId] },
      transaction,
    );
  }

  private async createRecord(
    dto: CreateTicketDto,
    actor: Pick<AuthenticatedUser, 'roles' | 'clientIds' | 'siteIds'> & {
      id: string | null;
    },
    transaction?: PoolClient,
  ) {
    const db = transaction ?? (await this.dependencies.db.connect());
    try {
      if (!transaction) await db.query('BEGIN');
      await this.validateLinks(db, dto, actor);
      const number = await db.query<{ ticket_number: string }>(
        'SELECT next_ticket_number($1::uuid,$2::uuid) AS ticket_number',
        [dto.clientId, dto.siteId ?? null],
      );
      const inserted = await db.query<{ id: string; ticket_number: string }>(
        `INSERT INTO tickets
          (ticket_number,client_id,requester_id,site_id,department_id,location_text,category_id,assigned_user_id,created_by_user_id,
           subject,description,source,priority,source_reference_id,source_conversation_id,source_message_id,source_url,external_thread_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING id,ticket_number`,
        [
          number.rows[0]?.ticket_number,
          dto.clientId,
          dto.requesterId,
          dto.siteId ?? null,
          dto.departmentId ?? null,
          dto.locationText?.trim() || null,
          dto.categoryId,
          dto.assignedUserId ?? null,
          actor.id,
          dto.subject.trim(),
          dto.description.trim(),
          dto.source,
          dto.priority,
          dto.sourceReferenceId ?? null,
          dto.sourceConversationId ?? null,
          dto.sourceMessageId ?? null,
          dto.sourceUrl ?? null,
          dto.externalThreadId ?? null,
        ],
      );
      const ticket = inserted.rows[0];
      if (!ticket) throw new BadRequestException('Ticket could not be created');
      for (const tagId of new Set(dto.tagIds))
        await db.query(
          'INSERT INTO ticket_tags(ticket_id,tag_id,added_by_user_id) VALUES($1,$2,$3)',
          [ticket.id, tagId, actor.id],
        );
      if (dto.assignedUserId) {
        const assignment = await db.query<{ id: string }>(
          'INSERT INTO ticket_assignments(ticket_id,assigned_user_id,actor_user_id,reason) VALUES($1,$2,$3,$4) RETURNING id',
          [ticket.id, dto.assignedUserId, actor.id, 'Initial assignment'],
        );
        await enqueueNotification(db, {
          userId: dto.assignedUserId,
          ticketId: ticket.id,
          type: 'TICKET_ASSIGNED',
          title: `${ticket.ticket_number} assigned to you`,
          body: dto.subject.trim(),
          eventKey: `assignment:${assignment.rows[0]?.id ?? ticket.id}`,
        });
      }
      for (const attachment of dto.attachments ?? [])
        await this.insertAttachment(db, ticket.id, attachment, actor.id!);
      await db.query(
        `INSERT INTO ticket_sla(ticket_id,policy_id,calendar_id,target_priority,response_warning_at,response_due_at,resolution_warning_at,resolution_due_at)
         SELECT $1,p.id,p.calendar_id,p.priority,
           sla_add_business_minutes(p.calendar_id,now(),ceil(p.response_minutes*p.warning_percent/100.0)::int),
           sla_add_business_minutes(p.calendar_id,now(),p.response_minutes),
           sla_add_business_minutes(p.calendar_id,now(),ceil(p.resolution_minutes*p.warning_percent/100.0)::int),
           sla_add_business_minutes(p.calendar_id,now(),p.resolution_minutes)
         FROM sla_policies p WHERE p.priority=$2 AND p.active`,
        [ticket.id, dto.priority],
      );
      await this.history(db, ticket.id, actor.id, 'TICKET.CREATED', null, {
        ticketNumber: ticket.ticket_number,
        source: dto.source,
      });
      await this.audit(db, actor.id, 'TICKET.CREATED', ticket.id, {
        ticketNumber: ticket.ticket_number,
        clientId: dto.clientId,
      });
      await queueTicketEmail(
        db,
        ticket.id,
        null,
        actor.id,
        'New ticket created.',
      );
      if (!transaction) await db.query('COMMIT');
      return ticket;
    } catch (error) {
      if (!transaction) await db.query('ROLLBACK');
      throw error;
    } finally {
      if (!transaction) db.release();
    }
  }

  async detail(id: string, actor: AuthenticatedUser) {
    const ticket = await this.dependencies.db.query(
      `${this.ticketSelect()} WHERE t.id=$1 AND (
        $2::boolean OR (t.client_id=ANY($4::uuid[]) AND
          ($3::boolean OR t.assigned_user_id=$5 OR EXISTS(SELECT 1 FROM ticket_collaborators tc WHERE tc.ticket_id=t.id AND tc.user_id=$5)
            OR EXISTS(SELECT 1 FROM help_requests hr WHERE hr.ticket_id=t.id AND hr.status='PENDING' AND (hr.requested_user_id=$5 OR hr.department_id=ANY($8::uuid[])))
            OR ($6::boolean AND (cardinality($7::uuid[])=0 OR t.site_id=ANY($7::uuid[]))))))`,
      [
        id,
        actor.roles.includes('ADMIN'),
        this.hasWideAccess(actor),
        actor.clientIds,
        actor.id,
        this.hasPermission(actor, 'TICKETS_TEAM_VIEW'),
        actor.siteIds ?? [],
        actor.departmentIds ?? [],
      ],
    );
    if (!ticket.rows[0]) throw new NotFoundException();
    const [
      comments,
      history,
      attachments,
      approvals,
      collaborators,
      helpRequests,
      knowledge,
    ] = await Promise.all([
      this.dependencies.db.query(
        `SELECT tc.id,tc.comment_type,tc.body,tc.created_at,u.display_name AS author_name
         FROM ticket_comments tc JOIN users u ON u.id=tc.author_user_id
         WHERE tc.ticket_id=$1 ORDER BY tc.created_at,tc.id`,
        [id],
      ),
      this.dependencies.db.query(
        `SELECT h.id,h.action,h.previous_value,h.new_value,h.reason,h.created_at,
                COALESCE(u.display_name,'System') AS actor_name
         FROM ticket_history h LEFT JOIN users u ON u.id=h.actor_user_id
         WHERE h.ticket_id=$1 ORDER BY h.created_at,h.id`,
        [id],
      ),
      this.dependencies.db.query(
        `SELECT a.id,a.file_name,a.content_type,a.size_bytes,a.created_at,a.visibility,u.display_name AS uploaded_by
         FROM ticket_attachments a JOIN users u ON u.id=a.uploaded_by_user_id
         WHERE a.ticket_id=$1 ORDER BY a.created_at`,
        [id],
      ),
      this.dependencies.db.query(
        `SELECT a.id,a.status,a.reason,a.decision_note,a.created_at,a.decided_at,
          rq.display_name AS requested_by,dc.display_name AS decided_by
         FROM ticket_approvals a JOIN users rq ON rq.id=a.requested_by_user_id
         LEFT JOIN users dc ON dc.id=a.decided_by_user_id
         WHERE a.ticket_id=$1 ORDER BY a.created_at DESC`,
        [id],
      ),
      this.dependencies.db.query(
        `SELECT tc.user_id,u.display_name AS name,tc.reason,tc.created_at FROM ticket_collaborators tc JOIN users u ON u.id=tc.user_id WHERE tc.ticket_id=$1 ORDER BY u.display_name`,
        [id],
      ),
      this.dependencies.db.query(
        `SELECT h.*,rq.display_name AS requested_by,ru.display_name AS requested_user,d.name AS department_name,rs.display_name AS responded_by FROM help_requests h JOIN users rq ON rq.id=h.requested_by_user_id LEFT JOIN users ru ON ru.id=h.requested_user_id LEFT JOIN departments d ON d.id=h.department_id LEFT JOIN users rs ON rs.id=h.responded_by_user_id WHERE h.ticket_id=$1 ORDER BY h.created_at DESC`,
        [id],
      ),
      this.dependencies.db.query(
        "SELECT a.id,a.title,a.visibility FROM ticket_knowledge_links l JOIN knowledge_articles a ON a.id=l.article_id WHERE l.ticket_id=$1 AND a.status='PUBLISHED' AND (a.client_id IS NULL OR a.client_id=$2) ORDER BY a.title",
        [id, ticket.rows[0].client_id],
      ),
    ]);
    const problems = actor.roles.some((r) =>
      ['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
    )
      ? await this.dependencies.db.query(
          `SELECT p.id,p.problem_number,p.title,p.status FROM problem_tickets pt JOIN problems p ON p.id=pt.problem_id WHERE pt.ticket_id=$1 AND ($2::boolean OR (p.client_id=ANY($3::uuid[]) AND (cardinality($4::uuid[])=0 OR p.site_id=ANY($4::uuid[])))) ORDER BY p.updated_at DESC`,
          [
            id,
            actor.roles.includes('ADMIN'),
            actor.clientIds,
            actor.siteIds ?? [],
          ],
        )
      : { rows: [] };
    return {
      ticket: ticket.rows[0],
      comments: comments.rows,
      history: history.rows,
      attachments: attachments.rows,
      approvals: approvals.rows,
      collaborators: collaborators.rows,
      helpRequests: helpRequests.rows,
      knowledge: knowledge.rows,
      problems: problems.rows,
    };
  }

  async update(id: string, dto: UpdateTicketDto, actor: AuthenticatedUser) {
    if (actor.roles.includes('INTERN'))
      throw new ForbiddenException('Interns cannot change ticket controls');
    if (!dto.status && !dto.priority && !dto.categoryId && !dto.tagIds)
      throw new BadRequestException('No ticket changes supplied');
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const current = await db.query(
        `SELECT status,priority,category_id FROM tickets WHERE id=$1 AND
         ($2::boolean OR (client_id=ANY($4::uuid[]) AND ($3::boolean OR assigned_user_id=$5))) FOR UPDATE`,
        [
          id,
          actor.roles.includes('ADMIN'),
          this.hasWideAccess(actor),
          actor.clientIds,
          actor.id,
        ],
      );
      if (!current.rows[0]) throw new NotFoundException();
      const before = current.rows[0] as Record<string, unknown>;
      if (dto.categoryId)
        await this.requireActive(db, 'categories', dto.categoryId);
      await db.query(
        `UPDATE tickets SET status=COALESCE($2,status),priority=COALESCE($3,priority),category_id=COALESCE($4,category_id),
          resolved_at=CASE WHEN $2='RESOLVED' THEN COALESCE(resolved_at,now()) WHEN $2 IS NOT NULL AND $2<>'RESOLVED' THEN NULL ELSE resolved_at END,
          closed_at=CASE WHEN $2='CLOSED' THEN COALESCE(closed_at,now()) WHEN $2 IS NOT NULL AND $2<>'CLOSED' THEN NULL ELSE closed_at END,
          updated_at=now() WHERE id=$1`,
        [id, dto.status ?? null, dto.priority ?? null, dto.categoryId ?? null],
      );
      const priorityChanged = Boolean(
        dto.priority && dto.priority !== before.priority,
      );
      const previousPaused = pausedStatuses.has(String(before.status));
      const effectiveStatus = String(dto.status ?? before.status);
      const nextPaused = pausedStatuses.has(effectiveStatus);
      if (priorityChanged)
        await db.query(
          `UPDATE ticket_sla s SET policy_id=p.id,calendar_id=p.calendar_id,target_priority=p.priority,
            response_warning_at=sla_add_business_minutes(p.calendar_id,t.created_at,ceil(p.response_minutes*p.warning_percent/100.0)::int),
            response_due_at=sla_add_business_minutes(p.calendar_id,t.created_at,p.response_minutes),
            resolution_warning_at=sla_add_business_minutes(p.calendar_id,t.created_at,ceil(p.resolution_minutes*p.warning_percent/100.0)::int),
            resolution_due_at=sla_add_business_minutes(p.calendar_id,t.created_at,p.resolution_minutes),
            paused_at=NULL,response_warning_remaining_minutes=NULL,response_remaining_minutes=NULL,
            resolution_warning_remaining_minutes=NULL,resolution_remaining_minutes=NULL,updated_at=now()
           FROM tickets t,sla_policies p
           WHERE s.ticket_id=t.id AND t.id=$1 AND p.priority=$2 AND p.active`,
          [id, dto.priority],
        );
      if (nextPaused && (!previousPaused || priorityChanged))
        await db.query(
          `UPDATE ticket_sla SET paused_at=now(),
            response_warning_remaining_minutes=CASE WHEN response_completed_at IS NULL THEN sla_business_minutes_between(calendar_id,now(),response_warning_at) END,
            response_remaining_minutes=CASE WHEN response_completed_at IS NULL THEN sla_business_minutes_between(calendar_id,now(),response_due_at) END,
            resolution_warning_remaining_minutes=CASE WHEN resolution_completed_at IS NULL THEN sla_business_minutes_between(calendar_id,now(),resolution_warning_at) END,
            resolution_remaining_minutes=CASE WHEN resolution_completed_at IS NULL THEN sla_business_minutes_between(calendar_id,now(),resolution_due_at) END,
            updated_at=now() WHERE ticket_id=$1`,
          [id],
        );
      if (previousPaused && !nextPaused)
        await db.query(
          `UPDATE ticket_sla SET
            response_warning_at=CASE WHEN response_warning_remaining_minutes IS NULL THEN response_warning_at ELSE sla_add_business_minutes(calendar_id,now(),response_warning_remaining_minutes) END,
            response_due_at=CASE WHEN response_remaining_minutes IS NULL THEN response_due_at ELSE sla_add_business_minutes(calendar_id,now(),response_remaining_minutes) END,
            resolution_warning_at=CASE WHEN resolution_warning_remaining_minutes IS NULL THEN resolution_warning_at ELSE sla_add_business_minutes(calendar_id,now(),resolution_warning_remaining_minutes) END,
            resolution_due_at=CASE WHEN resolution_remaining_minutes IS NULL THEN resolution_due_at ELSE sla_add_business_minutes(calendar_id,now(),resolution_remaining_minutes) END,
            paused_at=NULL,response_warning_remaining_minutes=NULL,response_remaining_minutes=NULL,
            resolution_warning_remaining_minutes=NULL,resolution_remaining_minutes=NULL,updated_at=now()
           WHERE ticket_id=$1`,
          [id],
        );
      if (dto.status)
        await db.query(
          `UPDATE ticket_sla SET resolution_completed_at=CASE
            WHEN $2 IN ('RESOLVED','CLOSED') THEN COALESCE(resolution_completed_at,now())
            WHEN $2 NOT IN ('CANCELLED') THEN NULL ELSE resolution_completed_at END,updated_at=now()
           WHERE ticket_id=$1`,
          [id, dto.status],
        );
      for (const [key, next, previous] of [
        ['STATUS', dto.status, before.status],
        ['PRIORITY', dto.priority, before.priority],
        ['CATEGORY', dto.categoryId, before.category_id],
      ] as const)
        if (next && next !== previous)
          await this.history(
            db,
            id,
            actor.id,
            `TICKET.${key}_CHANGED`,
            previous,
            next,
            dto.reason,
          );
      if (dto.tagIds) {
        for (const tag of new Set(dto.tagIds))
          await this.requireActive(db, 'tags', tag);
        const old = await db.query<{ tag_id: string }>(
          'SELECT tag_id FROM ticket_tags WHERE ticket_id=$1',
          [id],
        );
        await db.query('DELETE FROM ticket_tags WHERE ticket_id=$1', [id]);
        for (const tag of new Set(dto.tagIds))
          await db.query(
            'INSERT INTO ticket_tags(ticket_id,tag_id,added_by_user_id) VALUES($1,$2,$3)',
            [id, tag, actor.id],
          );
        await this.history(
          db,
          id,
          actor.id,
          'TICKET.TAGS_CHANGED',
          old.rows.map((row) => row.tag_id),
          dto.tagIds,
          dto.reason,
        );
      }
      await this.audit(
        db,
        actor.id,
        'TICKET.UPDATED',
        id,
        dto as unknown as Record<string, unknown>,
      );
      if (dto.status && dto.status !== before.status)
        await queueTicketEmail(
          db,
          id,
          null,
          actor.id,
          `Status changed to ${dto.status}.`,
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

  async assign(id: string, dto: AssignTicketDto, actor: AuthenticatedUser) {
    if (actor.roles.includes('INTERN'))
      throw new ForbiddenException('Interns cannot assign or transfer tickets');
    if (!this.hasPermission(actor, 'TICKETS_ASSIGN'))
      throw new ForbiddenException();
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const ticket = await db.query<{
        assigned_user_id: string | null;
        client_id: string;
        site_id: string | null;
        ticket_number: string;
        subject: string;
      }>(
        `SELECT assigned_user_id,client_id,site_id,ticket_number,subject FROM tickets WHERE id=$1 AND
         ($2::boolean OR (client_id=ANY($4::uuid[]) AND ($3::boolean OR assigned_user_id=$5))) FOR UPDATE`,
        [
          id,
          actor.roles.includes('ADMIN'),
          this.hasWideAccess(actor),
          actor.clientIds,
          actor.id,
        ],
      );
      if (!ticket.rows[0]) throw new NotFoundException();
      await this.requireStaffUser(
        db,
        dto.assignedUserId,
        ticket.rows[0].client_id,
        ticket.rows[0].site_id,
      );
      const previous = ticket.rows[0].assigned_user_id;
      if (previous && previous !== dto.assignedUserId && !dto.reason?.trim())
        throw new BadRequestException('A transfer reason is required');
      if (previous === dto.assignedUserId)
        throw new BadRequestException(
          'Ticket is already assigned to this technician',
        );
      await db.query(
        "UPDATE tickets SET assigned_user_id=$2,status=CASE WHEN status='NEW' THEN 'OPEN' ELSE status END,updated_at=now() WHERE id=$1",
        [id, dto.assignedUserId],
      );
      const assignment = await db.query<{ id: string }>(
        'INSERT INTO ticket_assignments(ticket_id,previous_user_id,assigned_user_id,actor_user_id,reason) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [
          id,
          previous,
          dto.assignedUserId,
          actor.id,
          dto.reason?.trim() || 'Assigned',
        ],
      );
      await enqueueNotification(db, {
        userId: dto.assignedUserId,
        ticketId: id,
        type: previous ? 'TICKET_TRANSFERRED' : 'TICKET_ASSIGNED',
        title: `${ticket.rows[0].ticket_number} ${previous ? 'transferred' : 'assigned'} to you`,
        body: ticket.rows[0].subject,
        eventKey: `assignment:${assignment.rows[0]?.id ?? `${id}:${dto.assignedUserId}`}`,
      });
      await this.history(
        db,
        id,
        actor.id,
        previous ? 'TICKET.TRANSFERRED' : 'TICKET.ASSIGNED',
        previous,
        dto.assignedUserId,
        dto.reason,
      );
      await this.audit(
        db,
        actor.id,
        previous ? 'TICKET.TRANSFERRED' : 'TICKET.ASSIGNED',
        id,
        { previous, assignedUserId: dto.assignedUserId, reason: dto.reason },
      );
      await queueTicketEmail(
        db,
        id,
        null,
        actor.id,
        previous
          ? 'Ticket transferred to you or your team.'
          : 'Ticket assigned.',
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

  async claim(id: string, actor: AuthenticatedUser) {
    if (
      !actor.roles.some((role) =>
        ['TECHNICIAN', 'TEAM_LEAD', 'ADMIN'].includes(role),
      )
    )
      throw new ForbiddenException();
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const ticket = await db.query<{
        client_id: string;
        site_id: string | null;
        assigned_user_id: string | null;
      }>(
        `SELECT client_id,site_id,assigned_user_id FROM tickets
         WHERE id=$1 AND ($2::boolean OR client_id=ANY($3::uuid[])) FOR UPDATE`,
        [id, actor.roles.includes('ADMIN'), actor.clientIds],
      );
      const row = ticket.rows[0];
      if (!row) throw new NotFoundException();
      if (row.assigned_user_id)
        throw new BadRequestException('Ticket is already assigned');
      await this.requireStaffUser(db, actor.id, row.client_id, row.site_id);
      await db.query(
        `UPDATE tickets SET assigned_user_id=$2,status=CASE WHEN status='NEW' THEN 'OPEN' ELSE status END,
         updated_at=now() WHERE id=$1`,
        [id, actor.id],
      );
      await db.query(
        `INSERT INTO ticket_assignments(ticket_id,assigned_user_id,actor_user_id,reason)
         VALUES($1,$2,$2,'Claimed by technician')`,
        [id, actor.id],
      );
      await this.history(
        db,
        id,
        actor.id,
        'TICKET.ASSIGNED',
        null,
        actor.id,
        'Claimed by technician',
      );
      await this.audit(db, actor.id, 'TICKET.ASSIGNED', id, {
        assignedUserId: actor.id,
        reason: 'Claimed by technician',
      });
      await db.query('COMMIT');
      return { id, assignedUserId: actor.id };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async comment(id: string, dto: TicketCommentDto, actor: AuthenticatedUser) {
    if (actor.roles.includes('INTERN') && dto.type === 'PUBLIC')
      throw new ForbiddenException(
        'Interns can add internal notes, not public replies',
      );
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      await this.lockTicket(db, id, actor);
      const inserted = await db.query<{ id: string }>(
        'INSERT INTO ticket_comments(ticket_id,author_user_id,comment_type,body) VALUES($1,$2,$3,$4) RETURNING id',
        [id, actor.id, dto.type, dto.body.trim()],
      );
      if (dto.type === 'PUBLIC')
        await Promise.all([
          db.query(
            'UPDATE tickets SET first_response_at=COALESCE(first_response_at,now()),updated_at=now() WHERE id=$1',
            [id],
          ),
          db.query(
            'UPDATE ticket_sla SET response_completed_at=COALESCE(response_completed_at,now()),updated_at=now() WHERE ticket_id=$1',
            [id],
          ),
        ]);
      else
        await db.query('UPDATE tickets SET updated_at=now() WHERE id=$1', [id]);
      await this.history(
        db,
        id,
        actor.id,
        dto.type === 'PUBLIC'
          ? 'TICKET.PUBLIC_REPLY_ADDED'
          : 'TICKET.INTERNAL_NOTE_ADDED',
        null,
        { commentId: inserted.rows[0]?.id },
      );
      await this.audit(
        db,
        actor.id,
        dto.type === 'PUBLIC'
          ? 'TICKET.PUBLIC_REPLY_ADDED'
          : 'TICKET.INTERNAL_NOTE_ADDED',
        id,
        { commentId: inserted.rows[0]?.id },
      );
      if (dto.type === 'PUBLIC') {
        if (inserted.rows[0]?.id) {
          await queueRequesterReply(db, id, inserted.rows[0].id, actor.id);
          await queueTicketEmail(
            db,
            id,
            null,
            actor.id,
            'A public reply was added to the ticket.',
          );
        }
        const owner = await db.query<{
          assigned_user_id: string | null;
          ticket_number: string;
          subject: string;
        }>(
          'SELECT assigned_user_id,ticket_number,subject FROM tickets WHERE id=$1',
          [id],
        );
        if (
          owner.rows[0]?.assigned_user_id &&
          owner.rows[0].assigned_user_id !== actor.id
        )
          await enqueueNotification(db, {
            userId: owner.rows[0].assigned_user_id,
            ticketId: id,
            type: 'PUBLIC_REPLY',
            title: `Public reply added to ${owner.rows[0].ticket_number}`,
            body: owner.rows[0].subject,
            eventKey: `public-reply:${inserted.rows[0]?.id}`,
          });
      }
      await db.query('COMMIT');
      return inserted.rows[0];
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async requestApproval(
    id: string,
    dto: ApprovalRequestDto,
    actor: AuthenticatedUser,
  ) {
    if (actor.roles.includes('INTERN'))
      throw new ForbiddenException('Interns cannot request ticket approval');
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      await this.lockTicket(db, id, actor);
      const result = await db.query<{ id: string }>(
        'INSERT INTO ticket_approvals(ticket_id,requested_by_user_id,reason) VALUES($1,$2,$3) RETURNING id',
        [id, actor.id, dto.reason.trim()],
      );
      await db.query(
        "UPDATE tickets SET approval_status='PENDING',updated_at=now() WHERE id=$1",
        [id],
      );
      await this.history(
        db,
        id,
        actor.id,
        'TICKET.APPROVAL_REQUESTED',
        null,
        { approvalId: result.rows[0]?.id },
        dto.reason,
      );
      await this.audit(db, actor.id, 'TICKET.APPROVAL_REQUESTED', id, {
        approvalId: result.rows[0]?.id,
      });
      await db.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async decideApproval(
    id: string,
    dto: ApprovalDecisionDto,
    actor: AuthenticatedUser,
  ) {
    if (!this.hasPermission(actor, 'TICKETS_APPROVE'))
      throw new ForbiddenException();
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const pending = await db.query<{ id: string }>(
        "SELECT id FROM ticket_approvals WHERE ticket_id=$1 AND status='PENDING' FOR UPDATE",
        [id],
      );
      if (!pending.rows[0])
        throw new BadRequestException('No pending approval exists');
      await db.query(
        'UPDATE ticket_approvals SET status=$2,decision_note=$3,decided_by_user_id=$4,decided_at=now() WHERE id=$1',
        [pending.rows[0].id, dto.decision, dto.note.trim(), actor.id],
      );
      await db.query(
        'UPDATE tickets SET approval_status=$2,updated_at=now() WHERE id=$1',
        [id, dto.decision],
      );
      await this.history(
        db,
        id,
        actor.id,
        `TICKET.APPROVAL_${dto.decision}`,
        'PENDING',
        dto.decision,
        dto.note,
      );
      await this.audit(db, actor.id, `TICKET.APPROVAL_${dto.decision}`, id, {
        note: dto.note,
      });
      await db.query('COMMIT');
      return { id, decision: dto.decision };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async addAttachment(
    id: string,
    dto: AttachmentDto,
    actor: AuthenticatedUser,
  ) {
    const content = this.attachmentContent(dto);
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      await this.lockTicket(db, id, actor);
      const attachmentId = await this.insertAttachment(
        db,
        id,
        dto,
        actor.id,
        content,
      );
      await db.query('COMMIT');
      return { id: attachmentId };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  private async insertAttachment(
    db: PoolClient,
    ticketId: string,
    dto: AttachmentDto,
    actorId: string,
    validatedContent?: Buffer,
  ) {
    const content = validatedContent ?? this.attachmentContent(dto);
    const attachmentId = randomUUID();
    const stored = await storeTicketAttachment({
      ticketId,
      attachmentId,
      fileName: dto.fileName.trim(),
      content,
    });

    try {
      await db.query(
        `INSERT INTO ticket_attachments(id,ticket_id,uploaded_by_user_id,file_name,content_type,size_bytes,storage_key,sha256,content,visibility)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          attachmentId,
          ticketId,
          actorId,
          dto.fileName.trim(),
          dto.contentType,
          content.length,
          stored.storageKey,
          stored.sha256,
          Buffer.alloc(0),
          dto.visibility ?? 'INTERNAL',
        ],
      );
    } catch (error) {
      await deleteStoredTicketAttachment(stored.storageKey).catch(
        () => undefined,
      );
      throw error;
    }

    await this.history(db, ticketId, actorId, 'TICKET.ATTACHMENT_ADDED', null, {
      attachmentId,
      fileName: dto.fileName,
      sizeBytes: content.length,
      sha256: stored.sha256,
    });
    await this.audit(db, actorId, 'TICKET.ATTACHMENT_ADDED', ticketId, {
      attachmentId,
      fileName: dto.fileName,
      sizeBytes: content.length,
      sha256: stored.sha256,
    });
    return attachmentId;
  }

  private attachmentContent(dto: AttachmentDto) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(dto.contentType))
      throw new BadRequestException('This file type is not allowed');
    if (
      dto.fileName.includes('/') ||
      dto.fileName.includes('\\') ||
      dto.fileName.includes('\0')
    )
      throw new BadRequestException('Invalid file name');
    const content = Buffer.from(dto.contentBase64, 'base64');
    if (!content.length || content.length > MAX_ATTACHMENT_BYTES)
      throw new BadRequestException(
        'Attachments must be between 1 byte and 5 MB',
      );
    if (
      content.toString('base64').replace(/=+$/, '') !==
      dto.contentBase64.replace(/\s|=+$/g, '')
    )
      throw new BadRequestException('Invalid attachment data');
    return content;
  }

  async attachment(id: string, attachmentId: string, actor: AuthenticatedUser) {
    const result = await this.dependencies.db.query<{
      file_name: string;
      content_type: string;
      content: Buffer;
      storage_key: string;
    }>(
      `SELECT a.file_name,a.content_type,a.content,a.storage_key FROM ticket_attachments a
       JOIN tickets t ON t.id=a.ticket_id
       WHERE a.id=$1 AND a.ticket_id=$2 AND (
         $3::boolean OR (t.client_id=ANY($5::uuid[]) AND
           ($4::boolean OR t.assigned_user_id=$6 OR EXISTS(SELECT 1 FROM ticket_collaborators tc WHERE tc.ticket_id=t.id AND tc.user_id=$6) OR ($7::boolean AND
             (cardinality($8::uuid[])=0 OR t.site_id=ANY($8::uuid[]))))))`,
      [
        attachmentId,
        id,
        actor.roles.includes('ADMIN'),
        this.hasWideAccess(actor),
        actor.clientIds,
        actor.id,
        this.hasPermission(actor, 'TICKETS_TEAM_VIEW'),
        actor.siteIds ?? [],
      ],
    );
    if (!result.rows[0]) throw new NotFoundException();
    const row = result.rows[0];
    const content =
      row.content && row.content.length > 0
        ? row.content
        : await readStoredTicketAttachment(row.storage_key);
    return { ...row, content };
  }

  private savedViewQuery(query: TicketListQuery) {
    return Object.fromEntries(
      Object.entries({
        q: query.q || undefined,
        dashboardFilter: query.dashboardFilter,
        status: query.status,
        priority: query.priority,
        clientId: query.clientId,
        siteId: query.siteId,
        assignedUserId: query.assignedUserId,
        categoryId: query.categoryId,
        tagId: query.tagId,
        source: query.source,
        slaStatus: query.slaStatus,
        from: query.from,
        to: query.to,
      }).filter(([, value]) => value !== undefined && value !== ''),
    );
  }

  private ticketSelect() {
    return `SELECT t.*,c.name AS client_name,r.name AS requester_name,r.email AS requester_email,
      s.name AS site_name,
      CASE WHEN parentcat.name IS NULL THEN cat.name ELSE parentcat.name || ' → ' || cat.name END AS category_name,
      src.name AS source_name,u.display_name AS assigned_name,creator.display_name AS created_by_name,
      sla.response_warning_at,sla.response_due_at,sla.response_completed_at,
      sla.resolution_warning_at,sla.resolution_due_at,sla.resolution_completed_at,sla.paused_at,
      CASE WHEN sla.resolution_due_at IS NULL THEN 'NOT_TRACKED'
        WHEN t.status='CANCELLED' THEN 'NOT_TRACKED'
        WHEN sla.resolution_completed_at IS NOT NULL AND sla.resolution_completed_at<=sla.resolution_due_at THEN 'MET'
        WHEN sla.paused_at IS NOT NULL THEN 'PAUSED'
        WHEN COALESCE(sla.resolution_completed_at,now())>=sla.resolution_due_at THEN 'BREACHED'
        WHEN now()>=sla.resolution_warning_at THEN 'AT_RISK' ELSE 'ON_TRACK' END AS sla_status,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',tag.id,'name',tag.name) ORDER BY tag.name) FROM ticket_tags tt JOIN tags tag ON tag.id=tt.tag_id WHERE tt.ticket_id=t.id),'[]'::jsonb) AS tags
      FROM tickets t JOIN clients c ON c.id=t.client_id JOIN contacts r ON r.id=t.requester_id
      LEFT JOIN sites s ON s.id=t.site_id LEFT JOIN categories cat ON cat.id=t.category_id
      LEFT JOIN categories parentcat ON parentcat.id=cat.parent_id
      LEFT JOIN ticket_sources src ON src.code=t.source
      LEFT JOIN users u ON u.id=t.assigned_user_id LEFT JOIN users creator ON creator.id=t.created_by_user_id
      LEFT JOIN ticket_sla sla ON sla.ticket_id=t.id`;
  }

  private async validateLinks(
    db: PoolClient,
    dto: CreateTicketDto,
    actor: Pick<AuthenticatedUser, 'roles' | 'clientIds' | 'siteIds'>,
  ) {
    if (
      !actor.roles.includes('ADMIN') &&
      !actor.clientIds.includes(dto.clientId)
    )
      throw new ForbiddenException();
    if (
      dto.siteId &&
      !actor.roles.includes('ADMIN') &&
      (actor.siteIds?.length ?? 0) > 0 &&
      !actor.siteIds?.includes(dto.siteId)
    )
      throw new ForbiddenException();
    const requester = await db.query(
      'SELECT 1 FROM contacts WHERE id=$1 AND client_id=$2 AND active',
      [dto.requesterId, dto.clientId],
    );
    if (!requester.rowCount)
      throw new BadRequestException(
        'Requester does not belong to the selected client',
      );
    if (dto.siteId) {
      const site = await db.query(
        'SELECT 1 FROM sites WHERE id=$1 AND client_id=$2 AND active',
        [dto.siteId, dto.clientId],
      );
      if (!site.rowCount)
        throw new BadRequestException(
          'Site does not belong to the selected client',
        );
    }
    const internal = dto.clientId === '00000000-0000-4000-8000-000000000132';
    if (internal && !dto.departmentId)
      throw new BadRequestException('Internal tickets require a department');
    if (dto.departmentId) {
      const department = await db.query(
        'SELECT 1 FROM departments WHERE id=$1 AND active',
        [dto.departmentId],
      );
      if (!department.rowCount)
        throw new BadRequestException('Invalid internal department');
      if (!internal)
        throw new BadRequestException(
          'Departments apply only to internal tickets',
        );
    }
    await this.requireActive(db, 'categories', dto.categoryId);
    const source = await db.query(
      'SELECT 1 FROM ticket_sources WHERE code=$1 AND active',
      [dto.source],
    );
    if (!source.rowCount)
      throw new BadRequestException('Invalid ticket source');
    if (dto.assignedUserId)
      await this.requireStaffUser(
        db,
        dto.assignedUserId,
        dto.clientId,
        dto.siteId ?? null,
      );
    for (const tagId of new Set(dto.tagIds))
      await this.requireActive(db, 'tags', tagId);
  }

  private async requireActive(
    db: PoolClient,
    table: 'categories' | 'tags',
    id: string,
  ) {
    const result = await db.query(
      `SELECT 1 FROM ${table} WHERE id=$1 AND active`,
      [id],
    );
    if (!result.rowCount)
      throw new BadRequestException(`Invalid ${table.slice(0, -1)}`);
  }

  private async requireStaffUser(
    db: PoolClient,
    id: string,
    clientId?: string,
    siteId?: string | null,
  ) {
    const result = await db.query(
      `SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id
       WHERE u.id=$1 AND u.active AND r.role_code=ANY($2::text[])
         AND (r.role_code='ADMIN' OR $3::uuid IS NULL OR EXISTS(SELECT 1 FROM client_users cu WHERE cu.user_id=u.id AND cu.client_id=$3))
         AND (r.role_code='ADMIN' OR $4::uuid IS NULL OR NOT EXISTS(SELECT 1 FROM user_sites x WHERE x.user_id=u.id)
              OR EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id AND us.site_id=$4))
       LIMIT 1`,
      [id, STAFF_ROLES, clientId ?? null, siteId ?? null],
    );
    if (!result.rowCount)
      throw new BadRequestException(
        'Assigned user is not active service-desk staff',
      );
  }

  private hasWideAccess(actor: AuthenticatedUser) {
    return actor.roles.some((role) =>
      WIDE_TICKET_ROLES.includes(role as (typeof WIDE_TICKET_ROLES)[number]),
    );
  }

  private hasPermission(actor: AuthenticatedUser, permission: string) {
    return (
      actor.roles.includes('ADMIN') ||
      actor.permissions?.includes(permission) ||
      false
    );
  }

  private async lockTicket(
    db: PoolClient,
    id: string,
    actor: AuthenticatedUser,
  ) {
    const result = await db.query(
      `SELECT 1 FROM tickets WHERE id=$1 AND
       ($2::boolean OR (client_id=ANY($4::uuid[]) AND ($3::boolean OR assigned_user_id=$5 OR EXISTS(SELECT 1 FROM ticket_collaborators tc WHERE tc.ticket_id=tickets.id AND tc.user_id=$5)))) FOR UPDATE`,
      [
        id,
        actor.roles.includes('ADMIN'),
        this.hasWideAccess(actor),
        actor.clientIds,
        actor.id,
      ],
    );
    if (!result.rowCount) throw new NotFoundException();
  }

  private async history(
    db: PoolClient,
    ticketId: string,
    actorId: string | null,
    action: string,
    previous: unknown,
    next: unknown,
    reason?: string,
  ) {
    await db.query(
      'INSERT INTO ticket_history(ticket_id,actor_user_id,action,previous_value,new_value,reason) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',
      [
        ticketId,
        actorId,
        action,
        previous === undefined ? null : JSON.stringify(previous),
        next === undefined ? null : JSON.stringify(next),
        reason?.trim() || null,
      ],
    );
  }

  private async audit(
    db: PoolClient,
    actorId: string | null,
    action: string,
    entityId: string,
    details: Record<string, unknown>,
    entityType = 'TICKET',
  ) {
    await db.query(
      'INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5::jsonb)',
      [actorId, action, entityType, entityId, JSON.stringify(details)],
    );
  }
}

@ApiTags('Tickets')
@Controller('tickets')
export class TicketController {
  constructor(
    private readonly auth: AuthService,
    private readonly tickets: TicketService,
  ) {}

  private async staff(request: FastifyRequest) {
    return this.auth.requireRoles(request, STAFF_ROLES);
  }
  private async mutate(request: FastifyRequest) {
    await this.auth.verifyCsrf(request);
    return this.staff(request);
  }

  @Get('dashboard')
  async dashboard(
    @Req() request: FastifyRequest,
    @Query('scope') scope?: string,
  ) {
    const user = await this.staff(request);
    return this.tickets.dashboard(
      user,
      scope === 'all' &&
        user.roles.some((role) =>
          WIDE_TICKET_ROLES.includes(
            role as (typeof WIDE_TICKET_ROLES)[number],
          ),
        ),
    );
  }
  @Get('options')
  async options(@Req() request: FastifyRequest) {
    return this.tickets.options(await this.staff(request));
  }
  @Get('views')
  async views(@Req() request: FastifyRequest) {
    return this.tickets.savedViews(await this.staff(request));
  }
  @Post('views')
  async saveView(
    @Req() request: FastifyRequest,
    @Body() body: SaveTicketViewDto,
  ) {
    return this.tickets.saveView(body, await this.mutate(request));
  }
  @Delete('views/:id')
  async deleteView(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tickets.deleteView(id, await this.mutate(request));
  }
  @Get()
  async list(@Req() request: FastifyRequest, @Query() query: TicketListQuery) {
    return this.tickets.list(await this.staff(request), query);
  }
  @Post()
  async create(@Req() request: FastifyRequest, @Body() body: CreateTicketDto) {
    return this.tickets.create(body, await this.mutate(request));
  }
  @Post('requesters')
  async createRequester(
    @Req() request: FastifyRequest,
    @Body() body: CreateRequesterDto,
  ) {
    return this.tickets.createRequester(body, await this.mutate(request));
  }
  @Get(':id')
  async detail(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tickets.detail(id, await this.staff(request));
  }
  @Patch(':id')
  async update(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: UpdateTicketDto,
  ) {
    return this.tickets.update(id, body, await this.mutate(request));
  }
  @Post(':id/assign')
  async assign(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AssignTicketDto,
  ) {
    return this.tickets.assign(id, body, await this.mutate(request));
  }
  @Post(':id/claim')
  async claim(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tickets.claim(id, await this.mutate(request));
  }
  @Post(':id/comments')
  async comment(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TicketCommentDto,
  ) {
    return this.tickets.comment(id, body, await this.mutate(request));
  }
  @Post(':id/approval')
  async requestApproval(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ApprovalRequestDto,
  ) {
    return this.tickets.requestApproval(id, body, await this.mutate(request));
  }
  @Post(':id/approval/decision')
  async decideApproval(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ApprovalDecisionDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.tickets.decideApproval(id, body, await this.staff(request));
  }
  @Post(':id/attachments')
  async addAttachment(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AttachmentDto,
  ) {
    return this.tickets.addAttachment(id, body, await this.mutate(request));
  }
  @Get(':id/attachments/:attachmentId')
  async attachment(
    @Req() request: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.tickets.attachment(
      id,
      attachmentId,
      await this.staff(request),
    );
    reply.header('content-type', file.content_type);
    reply.header('x-content-type-options', 'nosniff');
    reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
    );
    return reply.send(file.content);
  }
}
