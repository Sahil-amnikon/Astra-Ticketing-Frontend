import {
  Body,
  Controller,
  Get,
  Injectable,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { AuthService, AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';

export type NotificationType =
  | 'TICKET_ASSIGNED'
  | 'TICKET_TRANSFERRED'
  | 'PUBLIC_REPLY'
  | 'SLA_AT_RISK'
  | 'SLA_BREACHED'
  | 'TICKET_UNATTENDED';

const preferenceColumn: Record<NotificationType, string> = {
  TICKET_ASSIGNED: 'ticket_assigned',
  TICKET_TRANSFERRED: 'ticket_transferred',
  PUBLIC_REPLY: 'public_reply',
  SLA_AT_RISK: 'sla_at_risk',
  SLA_BREACHED: 'sla_breached',
  TICKET_UNATTENDED: 'ticket_unattended',
};

export async function enqueueNotification(
  db: Pick<PoolClient, 'query'>,
  notification: {
    userId: string;
    ticketId: string;
    type: NotificationType;
    title: string;
    body: string;
    eventKey: string;
  },
) {
  const column = preferenceColumn[notification.type];
  await db.query(
    `INSERT INTO notifications(user_id,ticket_id,type,title,body,event_key)
     SELECT $1,$2,$3,$4,$5,$6
     WHERE COALESCE((SELECT ${column} FROM notification_preferences WHERE user_id=$1),true)
     ON CONFLICT(event_key) DO NOTHING`,
    [
      notification.userId,
      notification.ticketId,
      notification.type,
      notification.title,
      notification.body,
      notification.eventKey,
    ],
  );
}

export async function processNotificationJobs(dependencies: Dependencies) {
  const result = await dependencies.db.query(
    `WITH base AS (
       SELECT t.id,t.ticket_number,t.subject,t.assigned_user_id,t.first_response_at,t.created_at,
         s.calendar_id,s.resolution_warning_at,s.resolution_due_at
       FROM tickets t JOIN ticket_sla s ON s.ticket_id=t.id
       WHERE t.assigned_user_id IS NOT NULL AND s.paused_at IS NULL
         AND t.status NOT IN ('RESOLVED','CLOSED','CANCELLED')
     ), candidates AS (
       SELECT *, 'SLA_AT_RISK'::text AS notification_type,resolution_due_at::text AS event_version
         FROM base WHERE now() >= resolution_warning_at AND now() < resolution_due_at
       UNION ALL
       SELECT *, 'SLA_BREACHED',resolution_due_at::text
         FROM base WHERE now() >= resolution_due_at
       UNION ALL
       SELECT *, 'TICKET_UNATTENDED','first-response'
         FROM base WHERE first_response_at IS NULL
           AND sla_business_minutes_between(calendar_id,created_at,now()) >= 30
     )
     INSERT INTO notifications(user_id,ticket_id,type,title,body,event_key)
     SELECT assigned_user_id,id,notification_type,
       CASE notification_type
         WHEN 'SLA_BREACHED' THEN ticket_number || ' breached its resolution SLA'
         WHEN 'SLA_AT_RISK' THEN ticket_number || ' is approaching its resolution SLA'
         ELSE ticket_number || ' is awaiting a first response'
       END,
       subject,
       lower(notification_type) || ':' || id::text || ':' || event_version
     FROM candidates c
     WHERE notification_type IS NOT NULL AND COALESCE((SELECT CASE notification_type
       WHEN 'SLA_BREACHED' THEN p.sla_breached
       WHEN 'SLA_AT_RISK' THEN p.sla_at_risk
       ELSE p.ticket_unattended END
       FROM notification_preferences p WHERE p.user_id=c.assigned_user_id),true)
     ON CONFLICT(event_key) DO NOTHING
     RETURNING id`,
  );
  return result.rowCount ?? 0;
}

export class NotificationPreferencesDto {
  @IsBoolean() ticketAssigned!: boolean;
  @IsBoolean() ticketTransferred!: boolean;
  @IsBoolean() publicReply!: boolean;
  @IsBoolean() slaAtRisk!: boolean;
  @IsBoolean() slaBreached!: boolean;
  @IsBoolean() ticketUnattended!: boolean;
}

@Injectable()
export class NotificationService {
  constructor(private readonly dependencies: Dependencies) {}

  async list(user: AuthenticatedUser, rawLimit?: string) {
    const limit = Math.min(50, Math.max(1, Number(rawLimit) || 20));
    const unrestricted = user.roles.includes('ADMIN');
    const wide = user.roles.some((role) =>
      ['TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(role),
    );
    const team = user.permissions?.includes('TICKETS_TEAM_VIEW') ?? false;
    const access = `n.user_id=$1 AND (n.ticket_id IS NULL OR $3::boolean OR
      (t.client_id=ANY($4::uuid[]) AND ($5::boolean OR t.assigned_user_id=$1 OR
        EXISTS(SELECT 1 FROM ticket_collaborators tc WHERE tc.ticket_id=t.id AND tc.user_id=$1) OR
        EXISTS(SELECT 1 FROM help_requests hr WHERE hr.ticket_id=t.id AND hr.status='PENDING' AND (hr.requested_user_id=$1 OR hr.department_id=ANY($8::uuid[]))) OR
        ($6::boolean AND (cardinality($7::uuid[])=0 OR t.site_id=ANY($7::uuid[]))))))`;
    const values = [
      user.id,
      limit,
      unrestricted,
      user.clientIds,
      wide,
      team,
      user.siteIds ?? [],
      user.departmentIds ?? [],
    ];
    const [notifications, unread] = await Promise.all([
      this.dependencies.db.query(
        `SELECT n.id,n.ticket_id,n.change_id,n.type,n.title,n.body,n.read_at,n.created_at,
          t.ticket_number FROM notifications n LEFT JOIN tickets t ON t.id=n.ticket_id
         WHERE ${access} ORDER BY n.created_at DESC LIMIT $2`,
        values,
      ),
      this.dependencies.db.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM notifications n LEFT JOIN tickets t ON t.id=n.ticket_id
         WHERE ${access} AND $2::int > 0 AND n.read_at IS NULL`,
        values,
      ),
    ]);
    return { unread: unread.rows[0]?.count ?? 0, items: notifications.rows };
  }

  async preferences(userId: string) {
    const result = await this.dependencies.db.query(
      `SELECT ticket_assigned AS "ticketAssigned",ticket_transferred AS "ticketTransferred",
        public_reply AS "publicReply",sla_at_risk AS "slaAtRisk",sla_breached AS "slaBreached",
        ticket_unattended AS "ticketUnattended"
       FROM notification_preferences WHERE user_id=$1`,
      [userId],
    );
    return (
      result.rows[0] ?? {
        ticketAssigned: true,
        ticketTransferred: true,
        publicReply: true,
        slaAtRisk: true,
        slaBreached: true,
        ticketUnattended: true,
      }
    );
  }

  async updatePreferences(userId: string, dto: NotificationPreferencesDto) {
    await this.dependencies.db.query(
      `INSERT INTO notification_preferences
        (user_id,ticket_assigned,ticket_transferred,public_reply,sla_at_risk,sla_breached,ticket_unattended)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT(user_id) DO UPDATE SET ticket_assigned=excluded.ticket_assigned,
         ticket_transferred=excluded.ticket_transferred,public_reply=excluded.public_reply,
         sla_at_risk=excluded.sla_at_risk,sla_breached=excluded.sla_breached,
         ticket_unattended=excluded.ticket_unattended,updated_at=now()`,
      [
        userId,
        dto.ticketAssigned,
        dto.ticketTransferred,
        dto.publicReply,
        dto.slaAtRisk,
        dto.slaBreached,
        dto.ticketUnattended,
      ],
    );
    return dto;
  }

  async markRead(userId: string, id: string) {
    await this.dependencies.db.query(
      'UPDATE notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2',
      [id, userId],
    );
    return { id };
  }

  async markAllRead(userId: string) {
    await this.dependencies.db.query(
      'UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL',
      [userId],
    );
    return { read: true };
  }
}

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: NotificationService,
  ) {}

  @Get()
  async list(@Req() request: FastifyRequest, @Query('limit') limit?: string) {
    return this.service.list(await this.auth.currentUser(request), limit);
  }

  @Get('preferences')
  async preferences(@Req() request: FastifyRequest) {
    return this.service.preferences((await this.auth.currentUser(request)).id);
  }

  @Patch('preferences')
  async updatePreferences(
    @Req() request: FastifyRequest,
    @Body() body: NotificationPreferencesDto,
  ) {
    await this.auth.verifyCsrf(request);
    return this.service.updatePreferences(
      (await this.auth.currentUser(request)).id,
      body,
    );
  }

  @Patch('read-all')
  async markAllRead(@Req() request: FastifyRequest) {
    await this.auth.verifyCsrf(request);
    return this.service.markAllRead((await this.auth.currentUser(request)).id);
  }

  @Patch(':id/read')
  async markRead(@Req() request: FastifyRequest, @Param('id') id: string) {
    await this.auth.verifyCsrf(request);
    return this.service.markRead((await this.auth.currentUser(request)).id, id);
  }
}
