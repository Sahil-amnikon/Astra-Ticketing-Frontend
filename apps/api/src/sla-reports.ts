import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Param,
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
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService, AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';

const PRIORITIES = ['P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'] as const;
const spreadsheetCell = (value: unknown) => {
  const text = String(value ?? '');
  return typeof value === 'string' && /^[=+\-@\t\r]/.test(text)
    ? `'${text}`
    : text;
};

export class UpdateSlaPolicyDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(525600) responseMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(525600) resolutionMinutes!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(99) warningPercent!: number;
  @IsBoolean() active!: boolean;
  @IsUUID() calendarId!: string;
  @IsOptional() @IsBoolean() applyToOpenTickets = false;
}

class SlaHolidayDto {
  @IsDateString() date!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

export class SlaCalendarDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MaxLength(80) timezone!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  workingDays!: number[];
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) workStart!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) workEnd!: string;
  @IsBoolean() active!: boolean;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SlaHolidayDto)
  holidays!: SlaHolidayDto[];
}

export class ReportQuery {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsUUID() technicianId?: string;
}

export class ExportReportQuery extends ReportQuery {
  @IsIn(['csv', 'excel']) format!: 'csv' | 'excel';
}

@Injectable()
export class SlaReportService {
  constructor(private readonly dependencies: Dependencies) {}

  async policies() {
    const result = await this.dependencies.db.query(
      `SELECT p.id,p.priority,p.response_minutes,p.resolution_minutes,p.warning_percent,p.active,
       p.calendar_id,c.name AS calendar_name,p.updated_at
       FROM sla_policies p JOIN sla_calendars c ON c.id=p.calendar_id
       ORDER BY CASE p.priority
       WHEN 'P1_CRITICAL' THEN 1 WHEN 'P2_HIGH' THEN 2 WHEN 'P3_MEDIUM' THEN 3 ELSE 4 END`,
    );
    return result.rows;
  }

  async calendars() {
    const result = await this.dependencies.db.query(
      `SELECT c.id,c.name,c.timezone,c.working_days,c.work_start,c.work_end,c.active,
        COALESCE(jsonb_agg(jsonb_build_object('id',h.id,'date',h.holiday_date,'name',h.name)
          ORDER BY h.holiday_date) FILTER (WHERE h.id IS NOT NULL),'[]'::jsonb) AS holidays
       FROM sla_calendars c LEFT JOIN sla_holidays h ON h.calendar_id=c.id
       GROUP BY c.id ORDER BY c.name`,
    );
    return result.rows;
  }

  private validateCalendar(dto: SlaCalendarDto) {
    if (dto.workStart >= dto.workEnd)
      throw new BadRequestException(
        'Calendar end time must be after start time',
      );
    if (
      new Set(dto.workingDays).size !== dto.workingDays.length ||
      dto.workingDays.some(
        (day) => !Number.isInteger(day) || day < 1 || day > 7,
      )
    )
      throw new BadRequestException(
        'Working days must be unique values from 1 to 7',
      );
    try {
      new Intl.DateTimeFormat('en', { timeZone: dto.timezone }).format();
    } catch {
      throw new BadRequestException('Use a valid IANA timezone');
    }
  }

  async createCalendar(dto: SlaCalendarDto, actor: AuthenticatedUser) {
    this.validateCalendar(dto);
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const inserted = await db.query<{ id: string }>(
        `INSERT INTO sla_calendars(name,timezone,working_days,work_start,work_end,active,updated_by_user_id)
         VALUES($1,$2,$3::smallint[],$4::time,$5::time,$6,$7) RETURNING id`,
        [
          dto.name.trim(),
          dto.timezone,
          dto.workingDays,
          dto.workStart,
          dto.workEnd,
          dto.active,
          actor.id,
        ],
      );
      const id = inserted.rows[0]?.id;
      if (!id) throw new BadRequestException('Calendar could not be created');
      for (const holiday of dto.holidays)
        await db.query(
          'INSERT INTO sla_holidays(calendar_id,holiday_date,name) VALUES($1,$2,$3)',
          [id, holiday.date.slice(0, 10), holiday.name.trim()],
        );
      await db.query(
        `INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,'SLA_CALENDAR.CREATED','SLA_CALENDAR',$2,$3::jsonb)`,
        [actor.id, id, JSON.stringify({ name: dto.name })],
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

  async updateCalendar(
    id: string,
    dto: SlaCalendarDto,
    actor: AuthenticatedUser,
  ) {
    this.validateCalendar(dto);
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const before = await db.query(
        'SELECT * FROM sla_calendars WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!before.rows[0]) throw new BadRequestException('Calendar not found');
      if (!dto.active) {
        const used = await db.query(
          `SELECT 1 FROM sla_policies WHERE calendar_id=$1 AND active
           UNION ALL
           SELECT 1 FROM ticket_sla s JOIN tickets t ON t.id=s.ticket_id
             WHERE s.calendar_id=$1 AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')
           LIMIT 1`,
          [id],
        );
        if (used.rowCount)
          throw new BadRequestException(
            'An active SLA policy is using this calendar',
          );
      }
      await db.query(
        `UPDATE sla_calendars SET name=$2,timezone=$3,working_days=$4::smallint[],
          work_start=$5::time,work_end=$6::time,active=$7,updated_by_user_id=$8,updated_at=now()
         WHERE id=$1`,
        [
          id,
          dto.name.trim(),
          dto.timezone,
          dto.workingDays,
          dto.workStart,
          dto.workEnd,
          dto.active,
          actor.id,
        ],
      );
      await db.query('DELETE FROM sla_holidays WHERE calendar_id=$1', [id]);
      for (const holiday of dto.holidays)
        await db.query(
          'INSERT INTO sla_holidays(calendar_id,holiday_date,name) VALUES($1,$2,$3)',
          [id, holiday.date.slice(0, 10), holiday.name.trim()],
        );
      await db.query(
        `INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,'SLA_CALENDAR.UPDATED','SLA_CALENDAR',$2,$3::jsonb)`,
        [actor.id, id, JSON.stringify({ before: before.rows[0], after: dto })],
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

  async updatePolicy(
    priority: string,
    dto: UpdateSlaPolicyDto,
    actor: AuthenticatedUser,
  ) {
    if (dto.resolutionMinutes < dto.responseMinutes)
      throw new BadRequestException(
        'Resolution target must be greater than or equal to response target',
      );
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const before = await db.query(
        'SELECT * FROM sla_policies WHERE priority=$1 FOR UPDATE',
        [priority],
      );
      if (!before.rows[0]) throw new Error('SLA policy not found');
      const calendar = await db.query(
        'SELECT 1 FROM sla_calendars WHERE id=$1 AND active',
        [dto.calendarId],
      );
      if (!calendar.rowCount)
        throw new BadRequestException('Select an active SLA calendar');
      await db.query(
        `UPDATE sla_policies SET response_minutes=$2,resolution_minutes=$3,
          warning_percent=$4,active=$5,updated_by_user_id=$6,calendar_id=$7,updated_at=now()
         WHERE priority=$1`,
        [
          priority,
          dto.responseMinutes,
          dto.resolutionMinutes,
          dto.warningPercent,
          dto.active,
          actor.id,
          dto.calendarId,
        ],
      );
      if (dto.applyToOpenTickets && dto.active)
        await db.query(
          `UPDATE ticket_sla s SET policy_id=p.id,calendar_id=p.calendar_id,target_priority=p.priority,
            response_warning_at=sla_add_business_minutes(p.calendar_id,t.created_at,ceil(p.response_minutes*p.warning_percent/100.0)::int),
            response_due_at=sla_add_business_minutes(p.calendar_id,t.created_at,p.response_minutes),
            resolution_warning_at=sla_add_business_minutes(p.calendar_id,t.created_at,ceil(p.resolution_minutes*p.warning_percent/100.0)::int),
            resolution_due_at=sla_add_business_minutes(p.calendar_id,t.created_at,p.resolution_minutes),
            paused_at=NULL,response_warning_remaining_minutes=NULL,response_remaining_minutes=NULL,
            resolution_warning_remaining_minutes=NULL,resolution_remaining_minutes=NULL,updated_at=now()
           FROM tickets t,sla_policies p
           WHERE s.ticket_id=t.id AND p.priority=$1 AND t.priority=$1
             AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')`,
          [priority],
        );
      if (dto.applyToOpenTickets && dto.active)
        await db.query(
          `UPDATE ticket_sla s SET paused_at=now(),
            response_warning_remaining_minutes=CASE WHEN response_completed_at IS NULL THEN sla_business_minutes_between(calendar_id,now(),response_warning_at) END,
            response_remaining_minutes=CASE WHEN response_completed_at IS NULL THEN sla_business_minutes_between(calendar_id,now(),response_due_at) END,
            resolution_warning_remaining_minutes=CASE WHEN resolution_completed_at IS NULL THEN sla_business_minutes_between(calendar_id,now(),resolution_warning_at) END,
            resolution_remaining_minutes=CASE WHEN resolution_completed_at IS NULL THEN sla_business_minutes_between(calendar_id,now(),resolution_due_at) END
           FROM tickets t WHERE s.ticket_id=t.id AND t.priority=$1
             AND t.status IN ('WAITING_FOR_CLIENT','WAITING_FOR_VENDOR','ON_HOLD')`,
          [priority],
        );
      await db.query(
        `INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details)
         VALUES($1,'SLA_POLICY.UPDATED','SLA_POLICY',$2,$3::jsonb)`,
        [
          actor.id,
          priority,
          JSON.stringify({ before: before.rows[0], after: dto }),
        ],
      );
      await db.query('COMMIT');
      return { priority };
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async technicianReport(from: string, to: string, technicianId?: string) {
    if (new Date(from) >= new Date(to))
      throw new BadRequestException('Report start must be before report end');
    const staffRoles = ['TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'];
    const technicians = await this.dependencies.db.query(
      `SELECT DISTINCT u.id,u.display_name AS name,u.email,u.active FROM users u
       JOIN user_roles ur ON ur.user_id=u.id
       WHERE ur.role_code=ANY($1::text[]) ORDER BY u.display_name`,
      [staffRoles],
    );
    if (
      technicianId &&
      !technicians.rows.some((row) => row.id === technicianId)
    )
      throw new BadRequestException('Selected technician is not available');
    const result = await this.dependencies.db.query(
      `WITH staff AS (
         SELECT DISTINCT u.id,u.display_name,u.email FROM users u
         JOIN user_roles ur ON ur.user_id=u.id
         WHERE ur.role_code=ANY($3::text[]) AND ($4::uuid IS NULL OR u.id=$4)
       ), assignments AS (
         SELECT assigned_user_id AS user_id,
           count(*)::int AS received,
           count(*) FILTER (WHERE previous_user_id IS NOT NULL)::int AS transferred_in
         FROM ticket_assignments WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
         GROUP BY assigned_user_id
       ), transfers_out AS (
         SELECT previous_user_id AS user_id,count(*)::int AS transferred_out
         FROM ticket_assignments WHERE previous_user_id IS NOT NULL
           AND created_at >= $1::timestamptz AND created_at < $2::timestamptz
         GROUP BY previous_user_id
       ), work AS (
         SELECT author_user_id AS user_id,count(DISTINCT ticket_id)::int AS worked
         FROM ticket_comments WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
         GROUP BY author_user_id
       ), resolved AS (
         SELECT actor_user_id AS user_id,count(*)::int AS resolved,
           count(*) FILTER (WHERE s.resolution_completed_at <= s.resolution_due_at)::int AS sla_met,
           count(*) FILTER (WHERE s.resolution_completed_at > s.resolution_due_at)::int AS sla_breached
         FROM ticket_history h JOIN ticket_sla s ON s.ticket_id=h.ticket_id
         WHERE h.action='TICKET.STATUS_CHANGED' AND h.new_value='"RESOLVED"'::jsonb
           AND h.created_at >= $1::timestamptz AND h.created_at < $2::timestamptz
         GROUP BY actor_user_id
       ), open_now AS (
         SELECT assigned_user_id AS user_id,count(*)::int AS open
         FROM tickets WHERE status NOT IN ('RESOLVED','CLOSED','CANCELLED') GROUP BY assigned_user_id
       )
       SELECT s.id,s.display_name AS name,s.email,
         COALESCE(a.received,0) AS received,COALESCE(a.transferred_in,0) AS transferred_in,
         COALESCE(o.transferred_out,0) AS transferred_out,COALESCE(w.worked,0) AS worked,
         COALESCE(r.resolved,0) AS resolved,COALESCE(n.open,0) AS open,
         COALESCE(r.sla_met,0) AS sla_met,COALESCE(r.sla_breached,0) AS sla_breached
       FROM staff s LEFT JOIN assignments a ON a.user_id=s.id
       LEFT JOIN transfers_out o ON o.user_id=s.id LEFT JOIN work w ON w.user_id=s.id
       LEFT JOIN resolved r ON r.user_id=s.id LEFT JOIN open_now n ON n.user_id=s.id
       ORDER BY s.display_name`,
      [from, to, staffRoles, technicianId ?? null],
    );
    const tickets = technicianId
      ? await this.dependencies.db.query(
          `SELECT t.id,t.ticket_number,t.subject,c.name AS client_name,
             r.name AS requester_name,
             CASE WHEN parentcat.name IS NULL THEN cat.name ELSE parentcat.name || ' → ' || cat.name END AS category_name,
             t.priority,t.status,t.source,
             owner.display_name AS assigned_name,t.created_at,t.resolved_at,
             (SELECT min(a.created_at) FROM ticket_assignments a
               WHERE a.ticket_id=t.id AND a.assigned_user_id=$3
                 AND a.created_at >= $1::timestamptz AND a.created_at < $2::timestamptz) AS assigned_at,
             CASE
               WHEN s.resolution_completed_at IS NOT NULL AND s.resolution_completed_at<=s.resolution_due_at THEN 'MET'
               WHEN s.resolution_completed_at IS NOT NULL AND s.resolution_completed_at>s.resolution_due_at THEN 'BREACHED'
               WHEN s.paused_at IS NOT NULL THEN 'PAUSED'
               WHEN t.status NOT IN ('RESOLVED','CLOSED','CANCELLED') AND now()>=s.resolution_due_at THEN 'BREACHED'
               WHEN t.status NOT IN ('RESOLVED','CLOSED','CANCELLED') AND now()>=s.resolution_warning_at THEN 'AT_RISK'
               ELSE 'ON_TRACK'
             END AS sla_result
           FROM tickets t JOIN clients c ON c.id=t.client_id JOIN contacts r ON r.id=t.requester_id
           LEFT JOIN categories cat ON cat.id=t.category_id
           LEFT JOIN categories parentcat ON parentcat.id=cat.parent_id
           LEFT JOIN users owner ON owner.id=t.assigned_user_id
           LEFT JOIN ticket_sla s ON s.ticket_id=t.id
           WHERE t.assigned_user_id=$3
             OR EXISTS (SELECT 1 FROM ticket_assignments a WHERE a.ticket_id=t.id
               AND (a.assigned_user_id=$3 OR a.previous_user_id=$3)
               AND a.created_at >= $1::timestamptz AND a.created_at < $2::timestamptz)
             OR EXISTS (SELECT 1 FROM ticket_comments tc WHERE tc.ticket_id=t.id AND tc.author_user_id=$3
               AND tc.created_at >= $1::timestamptz AND tc.created_at < $2::timestamptz)
             OR EXISTS (SELECT 1 FROM ticket_history h WHERE h.ticket_id=t.id AND h.actor_user_id=$3
               AND h.created_at >= $1::timestamptz AND h.created_at < $2::timestamptz)
           ORDER BY t.updated_at DESC,t.ticket_number DESC`,
          [from, to, technicianId],
        )
      : { rows: [] };
    return {
      from,
      to,
      technicianId: technicianId ?? null,
      technicians: technicians.rows,
      rows: result.rows,
      tickets: tickets.rows,
    };
  }

  csv(report: {
    from: string;
    to: string;
    rows: Record<string, unknown>[];
    tickets?: Record<string, unknown>[];
  }) {
    const columns: Array<[string, string]> = [
      ['name', 'Technician'],
      ['email', 'Email'],
      ['received', 'Tickets received'],
      ['transferred_in', 'Transferred in'],
      ['transferred_out', 'Transferred out'],
      ['worked', 'Tickets worked'],
      ['resolved', 'Resolved'],
      ['open', 'Open now'],
      ['sla_met', 'SLA met'],
      ['sla_breached', 'SLA breached'],
    ];
    const quote = (value: unknown) =>
      `"${spreadsheetCell(value).replaceAll('"', '""')}"`;
    const output = [
      `Report period,${quote(report.from)},${quote(report.to)}`,
      columns.map(([, label]) => quote(label)).join(','),
      ...report.rows.map((row) =>
        columns.map(([key]) => quote(row[key])).join(','),
      ),
    ];
    if (report.tickets?.length) {
      const ticketColumns: Array<[string, string]> = [
        ['ticket_number', 'Ticket'],
        ['subject', 'Subject'],
        ['client_name', 'Client'],
        ['requester_name', 'Requester'],
        ['category_name', 'Category'],
        ['priority', 'Priority'],
        ['status', 'Status'],
        ['source', 'Source'],
        ['assigned_name', 'Current assignee'],
        ['assigned_at', 'Assigned during period'],
        ['resolved_at', 'Resolved'],
        ['sla_result', 'SLA result'],
      ];
      output.push(
        '',
        'Ticket detail',
        ticketColumns.map(([, label]) => quote(label)).join(','),
        ...report.tickets.map((ticket) =>
          ticketColumns.map(([key]) => quote(ticket[key])).join(','),
        ),
      );
    }
    return output.join('\r\n');
  }

  excelXml(report: {
    from: string;
    to: string;
    rows: Record<string, unknown>[];
    tickets?: Record<string, unknown>[];
  }) {
    const escape = (value: unknown) =>
      spreadsheetCell(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
    const headers = [
      'Technician',
      'Email',
      'Tickets received',
      'Transferred in',
      'Transferred out',
      'Tickets worked',
      'Resolved',
      'Open now',
      'SLA met',
      'SLA breached',
    ];
    const keys = [
      'name',
      'email',
      'received',
      'transferred_in',
      'transferred_out',
      'worked',
      'resolved',
      'open',
      'sla_met',
      'sla_breached',
    ];
    const row = (values: unknown[]) =>
      `<Row>${values.map((value) => `<Cell><Data ss:Type="String">${escape(value)}</Data></Cell>`).join('')}</Row>`;
    const ticketHeaders = [
      'Ticket',
      'Subject',
      'Client',
      'Requester',
      'Category',
      'Priority',
      'Status',
      'Source',
      'Current assignee',
      'Assigned during period',
      'Resolved',
      'SLA result',
    ];
    const ticketKeys = [
      'ticket_number',
      'subject',
      'client_name',
      'requester_name',
      'category_name',
      'priority',
      'status',
      'source',
      'assigned_name',
      'assigned_at',
      'resolved_at',
      'sla_result',
    ];
    const detail = report.tickets?.length
      ? `<Worksheet ss:Name="Ticket Detail"><Table>${row(ticketHeaders)}${report.tickets.map((item) => row(ticketKeys.map((key) => item[key]))).join('')}</Table></Worksheet>`
      : '';
    return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Technician Summary"><Table>${row(['Report period', report.from, report.to])}${row(headers)}${report.rows.map((item) => row(keys.map((key) => item[key]))).join('')}</Table></Worksheet>${detail}</Workbook>`;
  }
}

@ApiTags('SLA and reports')
@Controller()
export class SlaReportController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: SlaReportService,
  ) {}

  @Get('sla/policies')
  async policies(@Req() request: FastifyRequest) {
    await this.auth.requirePermission(request, 'SLA_MANAGE');
    return this.service.policies();
  }

  @Get('sla/calendars')
  async calendars(@Req() request: FastifyRequest) {
    await this.auth.requirePermission(request, 'SLA_MANAGE');
    return this.service.calendars();
  }

  @Post('sla/calendars')
  async createCalendar(
    @Req() request: FastifyRequest,
    @Body() body: SlaCalendarDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.service.createCalendar(
      body,
      await this.auth.requirePermission(request, 'SLA_MANAGE'),
    );
  }

  @Patch('sla/calendars/:id')
  async updateCalendar(
    @Req() request: FastifyRequest,
    @Param('id') id: string,
    @Body() body: SlaCalendarDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.service.updateCalendar(
      id,
      body,
      await this.auth.requirePermission(request, 'SLA_MANAGE'),
    );
  }

  @Patch('sla/policies/:priority')
  async updatePolicy(
    @Req() request: FastifyRequest,
    @Param('priority') priority: string,
    @Body() body: UpdateSlaPolicyDto,
  ) {
    if (!PRIORITIES.includes(priority as (typeof PRIORITIES)[number]))
      throw new BadRequestException('Invalid SLA priority');
    await this.auth.verifyCsrf(request);
    return this.service.updatePolicy(
      priority,
      body,
      await this.auth.requirePermission(request, 'SLA_MANAGE'),
    );
  }

  @Get('reports/technicians')
  async report(@Req() request: FastifyRequest, @Query() query: ReportQuery) {
    await this.auth.requirePermission(request, 'REPORTS_VIEW');
    return this.service.technicianReport(
      query.from,
      query.to,
      query.technicianId,
    );
  }

  @Get('reports/technicians/export')
  async export(
    @Req() request: FastifyRequest,
    @Query() query: ExportReportQuery,
    @Res() reply: FastifyReply,
  ) {
    await this.auth.requirePermission(request, 'REPORTS_VIEW');
    const report = await this.service.technicianReport(
      query.from,
      query.to,
      query.technicianId,
    );
    const suffix = `${query.from.slice(0, 10)}-to-${query.to.slice(0, 10)}`;
    reply.header('x-content-type-options', 'nosniff');
    if (query.format === 'excel') {
      reply.header('content-type', 'application/vnd.ms-excel; charset=utf-8');
      reply.header(
        'content-disposition',
        `attachment; filename="technician-report-${suffix}.xls"`,
      );
      return reply.send(this.service.excelXml(report));
    }
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header(
      'content-disposition',
      `attachment; filename="technician-report-${suffix}.csv"`,
    );
    return reply.send(this.service.csv(report));
  }
}
