import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
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
import type { PoolClient } from 'pg';
import { AuthService, type AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';
import { TicketService } from './tickets';

export const PROBLEM_STATUSES = [
  'OPEN',
  'INVESTIGATING',
  'KNOWN_ERROR',
  'RESOLVED',
  'CLOSED',
] as const;
const ROLES = ['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'];
const PRIORITIES = ['P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'];
export class ProblemQuery {
  @IsOptional() @IsString() @MaxLength(200) q = '';
  @IsOptional() @IsIn(PROBLEM_STATUSES) status?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
export class CreateProblemDto {
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(3) @MaxLength(10000) description!: string;
  @IsIn(PRIORITIES) priority = 'P3_MEDIUM';
}
export class UpdateProblemDto {
  @IsInt() @Min(1) revision!: number;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(3) @MaxLength(10000) description!: string;
  @IsIn(PRIORITIES) priority!: string;
  @IsIn(PROBLEM_STATUSES) status!: string;
  @IsString() @MaxLength(10000) rootCause = '';
  @IsString() @MaxLength(10000) workaround = '';
  @IsString() @MaxLength(10000) resolution = '';
  @IsUUID() ownerUserId!: string;
}
export class ProblemTicketDto {
  @IsUUID() ticketId!: string;
}
export class ProblemNoteDto {
  @IsString() @MinLength(2) @MaxLength(5000) body!: string;
}
type Problem = {
  id: string;
  client_id: string;
  site_id: string | null;
  owner_user_id: string;
  created_by_user_id: string;
  revision: number;
  status: string;
} & Record<string, unknown>;
export function problemManager(user: AuthenticatedUser) {
  return user.roles.some((r) => ['ADMIN', 'MANAGER', 'TEAM_LEAD'].includes(r));
}
export function requireProblemStaff(user: AuthenticatedUser) {
  if (!user.roles.some((r) => ROLES.includes(r)))
    throw new ForbiddenException(
      'Problem Management is available to support staff.',
    );
}
export function problemScope(user: AuthenticatedUser) {
  requireProblemStaff(user);
  return {
    sql: `($1::boolean OR (p.client_id=ANY($2::uuid[]) AND (cardinality($3::uuid[])=0 OR p.site_id=ANY($3::uuid[]))))`,
    values: [user.roles.includes('ADMIN'), user.clientIds, user.siteIds ?? []],
  };
}
export function validateProblemUpdate(
  dto: UpdateProblemDto,
  current: Problem,
  user: AuthenticatedUser,
) {
  requireProblemStaff(user);
  if (!problemManager(user) && current.owner_user_id !== user.id)
    throw new ForbiddenException(
      'Only the owner or a manager can edit this investigation.',
    );
  if (!problemManager(user) && dto.ownerUserId !== current.owner_user_id)
    throw new ForbiddenException(
      'Reassignment requires the Management workspace.',
    );
  if (
    !problemManager(user) &&
    (dto.status === 'CLOSED' || current.status === 'CLOSED')
  )
    throw new ForbiddenException(
      'Closing or reopening requires the Management workspace.',
    );
  const transitions: Record<string, string[]> = {
    OPEN: ['OPEN', 'INVESTIGATING', 'KNOWN_ERROR', 'RESOLVED'],
    INVESTIGATING: ['INVESTIGATING', 'OPEN', 'KNOWN_ERROR', 'RESOLVED'],
    KNOWN_ERROR: ['KNOWN_ERROR', 'INVESTIGATING', 'RESOLVED'],
    RESOLVED: ['RESOLVED', 'INVESTIGATING', 'CLOSED'],
    CLOSED: ['CLOSED', 'INVESTIGATING'],
  };
  if (!transitions[current.status]?.includes(dto.status))
    throw new BadRequestException('Invalid problem status transition.');
  if (
    ['KNOWN_ERROR', 'RESOLVED', 'CLOSED'].includes(dto.status) &&
    dto.rootCause.trim().length < 3
  )
    throw new BadRequestException('Record the root cause first.');
  if (dto.status === 'KNOWN_ERROR' && dto.workaround.trim().length < 3)
    throw new BadRequestException(
      'Record a usable workaround before marking a known error.',
    );
  if (
    ['RESOLVED', 'CLOSED'].includes(dto.status) &&
    dto.resolution.trim().length < 3
  )
    throw new BadRequestException('Record the resolution first.');
  if (dto.title.trim().length < 3 || dto.description.trim().length < 3)
    throw new BadRequestException('Title and description cannot be blank.');
}
@Injectable()
export class ProblemService {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly tickets: TicketService,
  ) {}
  private async transaction<T>(fn: (db: PoolClient) => Promise<T>) {
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const value = await fn(db);
      await db.query('COMMIT');
      return value;
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  }
  private async history(
    db: PoolClient,
    id: string,
    actor: string,
    action: string,
    details: object = {},
  ) {
    await db.query(
      'INSERT INTO problem_history(problem_id,actor_user_id,action,details) VALUES($1,$2,$3,$4::jsonb)',
      [id, actor, action, JSON.stringify(details)],
    );
    await db.query(
      "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'PROBLEM',$3,$4::jsonb)",
      [actor, action, id, JSON.stringify(details)],
    );
  }
  private async visible(
    id: string,
    user: AuthenticatedUser,
    db: Pick<PoolClient, 'query'> = this.dependencies.db,
    lock = false,
  ) {
    const scope = problemScope(user);
    const result = await db.query(
      `SELECT p.*,cl.name client_name,u.display_name owner_name FROM problems p JOIN clients cl ON cl.id=p.client_id JOIN users u ON u.id=p.owner_user_id WHERE ${scope.sql} AND p.id=$4 ${lock ? 'FOR UPDATE OF p' : ''}`,
      [...scope.values, id],
    );
    if (!result.rows[0]) throw new NotFoundException();
    return result.rows[0] as Problem;
  }
  async options(user: AuthenticatedUser) {
    requireProblemStaff(user);
    const [clients, sites] = await Promise.all([
      this.dependencies.db.query(
        "SELECT id,name FROM clients WHERE status='ACTIVE' AND ($1::boolean OR id=ANY($2::uuid[])) ORDER BY name",
        [user.roles.includes('ADMIN'), user.clientIds],
      ),
      this.dependencies.db.query(
        'SELECT id,client_id,name FROM sites WHERE active AND ($1::boolean OR (client_id=ANY($2::uuid[]) AND (cardinality($3::uuid[])=0 OR id=ANY($3::uuid[])))) ORDER BY name',
        [user.roles.includes('ADMIN'), user.clientIds, user.siteIds ?? []],
      ),
    ]);
    return { clients: clients.rows, sites: sites.rows };
  }
  async list(user: AuthenticatedUser, q: ProblemQuery) {
    const scope = problemScope(user);
    const result = await this.dependencies.db.query(
      `WITH filtered AS (SELECT p.*,cl.name client_name,u.display_name owner_name FROM problems p JOIN clients cl ON cl.id=p.client_id JOIN users u ON u.id=p.owner_user_id WHERE ${scope.sql} AND ($4::text IS NULL OR p.client_id=$4::uuid) AND ($5::text IS NULL OR p.status=$5) AND ($6='' OR p.problem_number ILIKE $7 OR p.title ILIKE $7)) SELECT (SELECT count(*)::int FROM filtered) total,COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM filtered ORDER BY updated_at DESC,id LIMIT $8 OFFSET $9) x),'[]') items`,
      [
        ...scope.values,
        q.clientId ?? null,
        q.status ?? null,
        q.q,
        `%${q.q.replace(/[\\%_]/g, '\\$&')}%`,
        q.pageSize,
        (q.page - 1) * q.pageSize,
      ],
    );
    return result.rows[0];
  }
  async create(user: AuthenticatedUser, dto: CreateProblemDto) {
    requireProblemStaff(user);
    if (!user.roles.includes('ADMIN') && !user.clientIds.includes(dto.clientId))
      throw new NotFoundException();
    if (
      (user.siteIds ?? []).length &&
      !dto.siteId &&
      !user.roles.includes('ADMIN')
    )
      throw new BadRequestException('Select a site within your access scope.');
    if (dto.title.trim().length < 3 || dto.description.trim().length < 3)
      throw new BadRequestException('Title and description cannot be blank.');
    return this.transaction(async (db) => {
      const client = await db.query(
        "SELECT id FROM clients WHERE id=$1 AND status='ACTIVE'",
        [dto.clientId],
      );
      if (!client.rowCount) throw new NotFoundException();
      if (dto.siteId) {
        const site = await db.query(
          'SELECT id FROM sites WHERE id=$1 AND client_id=$2 AND active',
          [dto.siteId, dto.clientId],
        );
        if (
          !site.rowCount ||
          (!user.roles.includes('ADMIN') &&
            (user.siteIds ?? []).length > 0 &&
            !user.siteIds?.includes(dto.siteId))
        )
          throw new NotFoundException();
      }
      const result = await db.query(
        'INSERT INTO problems(client_id,site_id,title,description,priority,owner_user_id,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$6) RETURNING *',
        [
          dto.clientId,
          dto.siteId ?? null,
          dto.title.trim(),
          dto.description.trim(),
          dto.priority,
          user.id,
        ],
      );
      await this.history(db, result.rows[0].id, user.id, 'PROBLEM.CREATED');
      return result.rows[0];
    });
  }
  async detail(id: string, user: AuthenticatedUser) {
    const problem = await this.visible(id, user);
    // Reuse ticket permissions; a problem never grants access to an incident.
    const linked = await this.dependencies.db.query(
      `SELECT t.id,t.ticket_number,t.subject,t.status,t.priority FROM problem_tickets pt JOIN tickets t ON t.id=pt.ticket_id WHERE pt.problem_id=$1 AND ($2::boolean OR (t.client_id=ANY($4::uuid[]) AND ($3::boolean OR t.assigned_user_id=$5 OR EXISTS(SELECT 1 FROM ticket_collaborators tc WHERE tc.ticket_id=t.id AND tc.user_id=$5) OR EXISTS(SELECT 1 FROM help_requests hr WHERE hr.ticket_id=t.id AND hr.status='PENDING' AND (hr.requested_user_id=$5 OR hr.department_id=ANY($8::uuid[]))) OR ($6::boolean AND (cardinality($7::uuid[])=0 OR t.site_id=ANY($7::uuid[])))))) ORDER BY pt.created_at`,
      [
        id,
        user.roles.includes('ADMIN'),
        user.roles.some((r) => ['ADMIN', 'MANAGER', 'TEAM_LEAD'].includes(r)),
        user.clientIds,
        user.id,
        user.permissions?.includes('TICKETS_TEAM_VIEW') ?? false,
        user.siteIds ?? [],
        user.departmentIds ?? [],
      ],
    );
    const history = await this.dependencies.db.query(
      'SELECT h.*,u.display_name actor_name FROM problem_history h JOIN users u ON u.id=h.actor_user_id WHERE problem_id=$1 ORDER BY created_at DESC,h.id DESC LIMIT 200',
      [id],
    );
    const owners = problemManager(user)
      ? await this.dependencies.db.query(
          `SELECT DISTINCT u.id,u.display_name FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE u.active AND ur.role_code=ANY($1::text[]) AND (EXISTS(SELECT 1 FROM user_roles ar WHERE ar.user_id=u.id AND ar.role_code='ADMIN') OR EXISTS(SELECT 1 FROM client_users uc WHERE uc.user_id=u.id AND uc.client_id=$2)) AND (NOT EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id) OR EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id AND us.site_id=$3)) ORDER BY u.display_name`,
          [ROLES, problem.client_id, problem.site_id],
        )
      : { rows: [] };
    return {
      problem,
      tickets: linked.rows,
      history: history.rows,
      owners: owners.rows,
      canEdit:
        user.workspace !== 'admin' &&
        (problemManager(user) || problem.owner_user_id === user.id),
      canManage: user.workspace !== 'admin' && problemManager(user),
    };
  }
  async update(id: string, user: AuthenticatedUser, dto: UpdateProblemDto) {
    return this.transaction(async (db) => {
      const current = await this.visible(id, user, db, true);
      if (current.revision !== dto.revision)
        throw new ConflictException(
          'This problem changed. Reload before saving.',
        );
      validateProblemUpdate(dto, current, user);
      const owner = await db.query(
        `SELECT u.id FROM users u WHERE u.id=$1 AND u.active AND EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_code=ANY($2::text[])) AND (EXISTS(SELECT 1 FROM user_roles ar WHERE ar.user_id=u.id AND ar.role_code='ADMIN') OR EXISTS(SELECT 1 FROM client_users uc WHERE uc.user_id=u.id AND uc.client_id=$3)) AND ((NOT EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id)) OR EXISTS(SELECT 1 FROM user_sites us WHERE us.user_id=u.id AND us.site_id=$4))`,
        [dto.ownerUserId, ROLES, current.client_id, current.site_id],
      );
      if (!owner.rowCount && dto.ownerUserId !== current.owner_user_id)
        throw new BadRequestException(
          'Choose an active support owner with access to this client.',
        );
      const result = await db.query(
        'UPDATE problems SET title=$2,description=$3,priority=$4,status=$5,root_cause=$6,workaround=$7,resolution=$8,owner_user_id=$9,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',
        [
          id,
          dto.title.trim(),
          dto.description.trim(),
          dto.priority,
          dto.status,
          dto.rootCause.trim(),
          dto.workaround.trim(),
          dto.resolution.trim(),
          dto.ownerUserId,
        ],
      );
      await this.history(db, id, user.id, 'PROBLEM.UPDATED', {
        previousStatus: current.status,
        status: dto.status,
        ownerUserId: dto.ownerUserId,
        revision: result.rows[0].revision,
      });
      return result.rows[0];
    });
  }
  async link(
    id: string,
    user: AuthenticatedUser,
    ticketId: string,
    remove = false,
  ) {
    const data = await this.tickets.detail(ticketId, user);
    return this.transaction(async (db) => {
      const current = await this.visible(id, user, db, true);
      if (!problemManager(user) && current.owner_user_id !== user.id)
        throw new ForbiddenException();
      if (current.status === 'CLOSED')
        throw new BadRequestException(
          'Reopen the problem before changing links.',
        );
      if (data.ticket.client_id !== current.client_id)
        throw new BadRequestException(
          'The ticket must belong to the same client.',
        );
      if (!remove) {
        const count = await db.query(
          'SELECT count(*)::int total FROM problem_tickets WHERE problem_id=$1',
          [id],
        );
        if (count.rows[0].total >= 100)
          throw new BadRequestException(
            'A problem can link up to 100 tickets.',
          );
      }
      const result = remove
        ? await db.query(
            'DELETE FROM problem_tickets WHERE problem_id=$1 AND ticket_id=$2 RETURNING ticket_id',
            [id, ticketId],
          )
        : await db.query(
            'INSERT INTO problem_tickets(problem_id,ticket_id,client_id,linked_by_user_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING ticket_id',
            [id, ticketId, current.client_id, user.id],
          );
      if (result.rowCount)
        await this.history(
          db,
          id,
          user.id,
          remove ? 'PROBLEM.TICKET_UNLINKED' : 'PROBLEM.TICKET_LINKED',
          { ticketId },
        );
      return { ok: true };
    });
  }
  async note(id: string, user: AuthenticatedUser, dto: ProblemNoteDto) {
    if (dto.body.trim().length < 2)
      throw new BadRequestException('Enter an investigation note.');
    return this.transaction(async (db) => {
      const current = await this.visible(id, user, db, true);
      if (current.status === 'CLOSED')
        throw new BadRequestException(
          'Reopen the problem before adding notes.',
        );
      await this.history(db, id, user.id, 'PROBLEM.NOTE', {
        body: dto.body.trim(),
      });
      return { ok: true };
    });
  }
}
@ApiTags('problems')
@Controller('problems')
export class ProblemController {
  constructor(
    private readonly auth: AuthService,
    private readonly problems: ProblemService,
  ) {}
  private staff(req: FastifyRequest) {
    return this.auth.requireRoles(req, ROLES);
  }
  private async mutate(req: FastifyRequest) {
    await this.auth.verifyCsrf(req);
    return this.staff(req);
  }
  @Get('options') async options(@Req() req: FastifyRequest) {
    return this.problems.options(await this.staff(req));
  }
  @Get() async list(@Req() req: FastifyRequest, @Query() q: ProblemQuery) {
    return this.problems.list(await this.staff(req), q);
  }
  @Post() async create(
    @Req() req: FastifyRequest,
    @Body() dto: CreateProblemDto,
  ) {
    return this.problems.create(await this.mutate(req), dto);
  }
  @Get(':id') async detail(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.problems.detail(id, await this.staff(req));
  }
  @Patch(':id') async update(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProblemDto,
  ) {
    return this.problems.update(id, await this.mutate(req), dto);
  }
  @Post(':id/tickets') async link(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ProblemTicketDto,
  ) {
    return this.problems.link(id, await this.mutate(req), dto.ticketId);
  }
  @Delete(':id/tickets/:ticketId') async unlink(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
  ) {
    return this.problems.link(id, await this.mutate(req), ticketId, true);
  }
  @Post(':id/notes') async note(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ProblemNoteDto,
  ) {
    return this.problems.note(id, await this.mutate(req), dto);
  }
}
