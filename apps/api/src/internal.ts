import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { AuthService, type AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';

export class DepartmentDto {
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class DepartmentMemberDto {
  @IsUUID() userId!: string;
  @IsOptional() @IsString() @MaxLength(1000) expertise?: string;
  @IsBoolean() isLead = false;
}
export class HelpRequestDto {
  @IsOptional() @IsUUID() requestedUserId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsString() @MinLength(3) @MaxLength(2000) expertiseNeeded!: string;
}
export class HelpDecisionDto {
  @IsIn(['ACCEPTED', 'DECLINED', 'COMPLETED']) status!: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

@Injectable()
export class InternalService {
  constructor(private readonly dependencies: Dependencies) {}

  async departments() {
    const r = await this.dependencies.db.query(
      `SELECT d.*,count(du.user_id)::int AS member_count FROM departments d LEFT JOIN department_users du ON du.department_id=d.id WHERE d.active GROUP BY d.id ORDER BY d.name`,
    );
    return r.rows;
  }
  async directory(user: AuthenticatedUser) {
    if (
      !user.roles.some((r) =>
        ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
      )
    )
      throw new ForbiddenException();
    const r = await this.dependencies.db.query(
      `SELECT u.id,u.display_name AS name,string_agg(DISTINCT d.name,', ') AS department_name,string_agg(DISTINCT du.expertise,'; ') AS expertise FROM users u LEFT JOIN department_users du ON du.user_id=u.id LEFT JOIN departments d ON d.id=du.department_id AND d.active WHERE u.active AND u.id<>$1 AND EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_code IN ('INTERN','TECHNICIAN','TEAM_LEAD','MANAGER','ADMIN')) GROUP BY u.id ORDER BY u.display_name`,
      [user.id],
    );
    return r.rows;
  }
  async createDepartment(dto: DepartmentDto, actor: AuthenticatedUser) {
    const r = await this.dependencies.db.query(
      'INSERT INTO departments(name,description) VALUES($1,$2) RETURNING id',
      [dto.name.trim(), dto.description?.trim() || null],
    );
    await this.dependencies.db.query(
      "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'DEPARTMENT.CREATED','DEPARTMENT',$2,$3::jsonb)",
      [actor.id, r.rows[0].id, JSON.stringify({ name: dto.name.trim() })],
    );
    return r.rows[0];
  }
  async addMember(
    id: string,
    dto: DepartmentMemberDto,
    actor: AuthenticatedUser,
  ) {
    const r = await this.dependencies.db.query(
      'INSERT INTO department_users(department_id,user_id,expertise,is_lead) SELECT $1,u.id,$3,$4 FROM users u WHERE u.id=$2 AND u.active ON CONFLICT(department_id,user_id) DO UPDATE SET expertise=excluded.expertise,is_lead=excluded.is_lead RETURNING user_id',
      [id, dto.userId, dto.expertise?.trim() || null, dto.isLead],
    );
    if (!r.rowCount) throw new BadRequestException('Select an active user');
    await this.dependencies.db.query(
      "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'DEPARTMENT.MEMBER_UPDATED','DEPARTMENT',$2,$3::jsonb)",
      [
        actor.id,
        id,
        JSON.stringify({ userId: dto.userId, isLead: dto.isLead }),
      ],
    );
    return { id };
  }
  private async assertTicket(id: string, user: AuthenticatedUser) {
    const r = await this.dependencies.db.query(
      `SELECT t.id,t.ticket_number,t.subject,t.client_id FROM tickets t WHERE t.id=$1 AND ($2::boolean OR (t.client_id=ANY($3::uuid[]) AND (t.assigned_user_id=$4 OR EXISTS(SELECT 1 FROM ticket_collaborators tc WHERE tc.ticket_id=t.id AND tc.user_id=$4) OR EXISTS(SELECT 1 FROM help_requests hr WHERE hr.ticket_id=t.id AND hr.status='PENDING' AND (hr.requested_user_id=$4 OR hr.department_id=ANY($6::uuid[]))) OR $5::boolean)))`,
      [
        id,
        user.roles.includes('ADMIN'),
        user.clientIds,
        user.id,
        user.roles.some((x) => ['TEAM_LEAD', 'MANAGER'].includes(x)),
        user.departmentIds ?? [],
      ],
    );
    if (!r.rows[0]) throw new NotFoundException();
    return r.rows[0] as {
      id: string;
      ticket_number: string;
      subject: string;
      client_id: string;
    };
  }
  async requestHelp(
    ticketId: string,
    dto: HelpRequestDto,
    user: AuthenticatedUser,
  ) {
    const ticket = await this.assertTicket(ticketId, user);
    if (!dto.requestedUserId && !dto.departmentId)
      throw new BadRequestException('Select a person or department');
    if (dto.requestedUserId) {
      const person = await this.dependencies.db.query(
        "SELECT u.id FROM users u WHERE u.id=$1 AND u.active AND u.id<>$2 AND EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_code IN ('INTERN','TECHNICIAN','TEAM_LEAD','MANAGER','ADMIN'))",
        [dto.requestedUserId, user.id],
      );
      if (!person.rows.length)
        throw new BadRequestException('Select another active staff member.');
    }
    if (dto.departmentId) {
      const department = await this.dependencies.db.query(
        'SELECT id FROM departments WHERE id=$1 AND active',
        [dto.departmentId],
      );
      if (!department.rows.length)
        throw new BadRequestException('Select an active department.');
    }
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const r = await db.query(
        'INSERT INTO help_requests(ticket_id,requested_by_user_id,department_id,requested_user_id,expertise_needed) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [
          ticketId,
          user.id,
          dto.departmentId ?? null,
          dto.requestedUserId ?? null,
          dto.expertiseNeeded.trim(),
        ],
      );
      const recipients = await db.query<{ id: string }>(
        `SELECT DISTINCT id FROM users WHERE active AND id<>$1 AND (id=$2 OR EXISTS(SELECT 1 FROM department_users du WHERE du.user_id=users.id AND du.department_id=$3))`,
        [user.id, dto.requestedUserId ?? null, dto.departmentId ?? null],
      );
      for (const person of recipients.rows)
        await db.query(
          `INSERT INTO notifications(user_id,ticket_id,type,title,body,event_key) VALUES($1,$2,'HELP_REQUESTED',$3,$4,$5) ON CONFLICT(event_key) DO NOTHING`,
          [
            person.id,
            ticketId,
            `Help requested for ${ticket.ticket_number}`,
            dto.expertiseNeeded.trim(),
            `help:${r.rows[0].id}:${person.id}`,
          ],
        );
      await db.query(
        "INSERT INTO ticket_history(ticket_id,actor_user_id,action,new_value,reason) VALUES($1,$2,'TICKET.HELP_REQUESTED',$3::jsonb,$4)",
        [
          ticketId,
          user.id,
          JSON.stringify({
            helpRequestId: r.rows[0].id,
            departmentId: dto.departmentId,
            requestedUserId: dto.requestedUserId,
          }),
          dto.expertiseNeeded.trim(),
        ],
      );
      await db.query('COMMIT');
      return r.rows[0];
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  }
  async decideHelp(
    ticketId: string,
    id: string,
    dto: HelpDecisionDto,
    user: AuthenticatedUser,
  ) {
    await this.assertTicket(ticketId, user);
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const allowed = await db.query(
        `SELECT h.*,t.ticket_number,t.subject FROM help_requests h JOIN tickets t ON t.id=h.ticket_id WHERE h.id=$1 AND h.ticket_id=$2 AND h.status='PENDING' AND (h.requested_user_id=$3 OR h.department_id=ANY($4::uuid[]) OR $5::boolean) FOR UPDATE`,
        [
          id,
          ticketId,
          user.id,
          user.departmentIds ?? [],
          user.roles.includes('ADMIN'),
        ],
      );
      if (!allowed.rows[0]) throw new ForbiddenException();
      await db.query(
        'UPDATE help_requests SET status=$3,responded_by_user_id=$4,response_note=$5,responded_at=now() WHERE id=$1 AND ticket_id=$2',
        [id, ticketId, dto.status, user.id, dto.note?.trim() || null],
      );
      if (dto.status === 'ACCEPTED')
        await db.query(
          'INSERT INTO ticket_collaborators(ticket_id,user_id,added_by_user_id,reason) VALUES($1,$2,$2,$3) ON CONFLICT(ticket_id,user_id) DO UPDATE SET reason=excluded.reason',
          [
            ticketId,
            user.id,
            `Accepted help request: ${allowed.rows[0].expertise_needed}`,
          ],
        );
      await db.query(
        `INSERT INTO notifications(user_id,ticket_id,type,title,body,event_key) VALUES($1,$2,'HELP_ACCEPTED',$3,$4,$5) ON CONFLICT(event_key) DO NOTHING`,
        [
          allowed.rows[0].requested_by_user_id,
          ticketId,
          `${allowed.rows[0].ticket_number} help request ${dto.status.toLowerCase()}`,
          allowed.rows[0].subject,
          `help-decision:${id}`,
        ],
      );
      await db.query(
        "INSERT INTO ticket_history(ticket_id,actor_user_id,action,new_value,reason) VALUES($1,$2,'TICKET.HELP_REQUEST_UPDATED',$3::jsonb,$4)",
        [
          ticketId,
          user.id,
          JSON.stringify({ helpRequestId: id, status: dto.status }),
          dto.note?.trim() || null,
        ],
      );
      await db.query('COMMIT');
      return { id, status: dto.status };
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  }
}

@ApiTags('Internal collaboration')
@Controller('internal')
export class InternalController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: InternalService,
  ) {}
  @Get('departments') async departments(@Req() r: FastifyRequest) {
    await this.auth.currentUser(r);
    return this.service.departments();
  }
  @Get('directory') async directory(@Req() r: FastifyRequest) {
    return this.service.directory(await this.auth.currentUser(r));
  }
  @Post('departments') async createDepartment(
    @Req() r: FastifyRequest,
    @Body() b: DepartmentDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.createDepartment(
      b,
      await this.auth.requireRoles(r, ['ADMIN']),
    );
  }
  @Post('departments/:id/members') async member(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: DepartmentMemberDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.addMember(
      id,
      b,
      await this.auth.requireRoles(r, ['ADMIN']),
    );
  }
  @Post('tickets/:id/help') async help(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: HelpRequestDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.requestHelp(id, b, await this.auth.currentUser(r));
  }
  @Patch('tickets/:ticketId/help/:id') async decide(
    @Req() r: FastifyRequest,
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: HelpDecisionDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.decideHelp(
      ticketId,
      id,
      b,
      await this.auth.currentUser(r),
    );
  }
}
