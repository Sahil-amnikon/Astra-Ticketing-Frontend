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
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService, type AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';
import { TicketService, CreateTicketDto } from './tickets';
import { ChangeService } from './changes';
import { changeTransaction } from './change-governance-rules';

export class MailReviewDto {
  @IsIn(['IGNORE', 'TICKET', 'CHANGE', 'RETRY']) action!: string;
  @IsOptional() @IsUUID() recordId?: string;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
}
export class MailIntakeDto {
  @IsUUID() clientId!: string;
  @IsUUID() requesterId!: string;
  @IsUUID() categoryId!: string;
  @IsOptional() @IsUUID() siteId?: string;
}
@Injectable()
export class MailRecordService {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly tickets: TicketService,
    private readonly changes: ChangeService,
  ) {}
  private admin(user: AuthenticatedUser) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException();
  }
  async visible(
    kind: 'TICKET' | 'CHANGE',
    id: string,
    user: AuthenticatedUser,
  ) {
    if (kind === 'CHANGE') {
      await this.changes.assertVisible(id, user);
      return;
    }
    if (
      user.roles.some((r) =>
        ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
      )
    ) {
      await this.tickets.detail(id, user);
      return;
    }
    const result = await this.dependencies.db.query(
      `SELECT 1 FROM tickets t JOIN contacts c ON c.id=t.requester_id
      WHERE t.id=$1 AND c.user_id=$2 AND c.active AND t.client_id=ANY($3::uuid[])
      AND (cardinality($4::uuid[])=0 OR t.site_id=ANY($4::uuid[]))`,
      [id, user.id, user.clientIds, user.siteIds ?? []],
    );
    if (!user.roles.includes('USER') || !result.rowCount)
      throw new NotFoundException();
  }
  async timeline(
    kind: 'TICKET' | 'CHANGE',
    id: string,
    user: AuthenticatedUser,
  ) {
    await this.visible(kind, id, user);
    const client = !user.roles.some((r) =>
      ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
    );
    if (client) return [];
    const field = kind === 'TICKET' ? 'ticket_id' : 'change_id';
    const messages = await this.dependencies.db.query(
      `SELECT m.id,m.direction,m.sender_address,m.subject,m.body,m.state,m.created_at,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'size_bytes',a.size_bytes)) FROM mail_attachments a WHERE a.message_id=m.id),'[]') AS attachments
      FROM mail_messages m WHERE ${field}=$1 AND ($2::boolean=false OR m.state IN ('RECEIVED','SENT')) ORDER BY m.created_at LIMIT 200`,
      [id, client],
    );
    return messages.rows;
  }
  async reviewDetail(id: string, user: AuthenticatedUser) {
    this.admin(user);
    const result = await this.dependencies.db.query(
      'SELECT id,channel,direction,state,sender_address,recipient_addresses,subject,body,last_error_code,created_at FROM mail_messages WHERE id=$1',
      [id],
    );
    if (!result.rows[0]) throw new NotFoundException();
    return result.rows[0];
  }
  async review(id: string, user: AuthenticatedUser, dto: MailReviewDto) {
    this.admin(user);
    if (dto.action === 'CHANGE')
      throw new BadRequestException('CAB email is disabled.');
    return changeTransaction(this.dependencies, async (db) => {
      const message = (
        await db.query('SELECT * FROM mail_messages WHERE id=$1 FOR UPDATE', [
          id,
        ])
      ).rows[0];
      if (!message) throw new NotFoundException();
      if (dto.action === 'RETRY') {
        if (
          message.direction !== 'OUTBOUND' ||
          !['UNKNOWN', 'FAILED'].includes(message.state)
        )
          throw new BadRequestException(
            'Only failed or uncertain outbound deliveries can be retried.',
          );
        await db.query(
          "UPDATE mail_messages SET state='QUEUED',attempts=0,last_error_code=NULL,next_attempt_at=now() WHERE id=$1",
          [id],
        );
      } else {
        if (message.direction !== 'INBOUND' || message.state !== 'REVIEW')
          throw new BadRequestException(
            'Message is no longer awaiting review.',
          );
        if (dto.action !== 'IGNORE' && !dto.recordId)
          throw new BadRequestException(
            'Choose a record to attach this message to.',
          );
        if (dto.action === 'TICKET')
          await this.visible('TICKET', dto.recordId!, user);
        if (dto.action === 'CHANGE')
          await this.visible('CHANGE', dto.recordId!, user);
        if (dto.action !== 'IGNORE' && dto.action !== message.channel)
          throw new BadRequestException(
            'Use the record type assigned to this mailbox.',
          );
        await db.query(
          "UPDATE mail_messages SET state=$2,ticket_id=$3,change_id=$4,last_error_code='MANUALLY_REVIEWED',processed_at=now() WHERE id=$1",
          [
            id,
            dto.action === 'IGNORE' ? 'IGNORED' : 'RECEIVED',
            dto.action === 'TICKET' ? dto.recordId : null,
            dto.action === 'CHANGE' ? dto.recordId : null,
          ],
        );
        if (dto.action === 'TICKET') {
          await db.query('UPDATE tickets SET updated_at=now() WHERE id=$1', [
            dto.recordId,
          ]);
          await db.query(
            "INSERT INTO ticket_history(ticket_id,actor_user_id,action,new_value,reason) VALUES($1,$2,'TICKET.EMAIL_LINKED',$3::jsonb,$4)",
            [
              dto.recordId,
              user.id,
              JSON.stringify({ messageId: id }),
              dto.reason,
            ],
          );
        }
        if (dto.action === 'CHANGE')
          await db.query(
            "INSERT INTO change_history(change_id,actor_user_id,event,details) VALUES($1,$2,'CHANGE.EMAIL_LINKED',$3::jsonb)",
            [
              dto.recordId,
              user.id,
              JSON.stringify({ messageId: id, reason: dto.reason }),
            ],
          );
      }
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'EMAIL.REVIEWED','EMAIL',$2,$3::jsonb)",
        [user.id, id, JSON.stringify(dto)],
      );
      return { saved: true };
    });
  }
  async intake(id: string, user: AuthenticatedUser, dto: MailIntakeDto) {
    this.admin(user);
    // A transaction-scoped advisory lock prevents two triage operators from creating duplicate tickets.
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `mail-intake:${id}`,
      ]);
      const message = (
        await db.query(
          "SELECT * FROM mail_messages WHERE id=$1 AND direction='INBOUND' AND channel='TICKET' AND state='REVIEW' FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!message)
        throw new BadRequestException(
          'This email is no longer awaiting ticket intake.',
        );
      const contact = (
        await db.query(
          'SELECT 1 FROM contacts WHERE id=$1 AND client_id=$2 AND lower(email)=lower($3) AND active',
          [dto.requesterId, dto.clientId, message.sender_address],
        )
      ).rowCount;
      if (!contact)
        throw new BadRequestException(
          'Choose an active contact matching the sender and organization.',
        );
      const ticket = await this.tickets.create(
        Object.assign(new CreateTicketDto(), {
          ...dto,
          subject: message.subject.slice(0, 200) || 'Email support request',
          description: message.body || '(No message text)',
          source: 'EMAIL',
          priority: 'P3_MEDIUM',
          tagIds: [],
          attachments: [],
          sourceMessageId: message.message_id,
        }),
        user,
        db,
      );
      await db.query(
        "UPDATE mail_messages SET ticket_id=$2,state='RECEIVED',last_error_code='MANUAL_INTAKE',processed_at=now() WHERE id=$1",
        [id, ticket.id],
      );
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'EMAIL.TICKET_CREATED','EMAIL',$2,$3::jsonb)",
        [user.id, id, JSON.stringify({ ticketId: ticket.id })],
      );
      await db.query('COMMIT');
      return ticket;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  async attachment(id: string, user: AuthenticatedUser) {
    if (
      !user.roles.some((r) =>
        ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
      )
    )
      throw new NotFoundException();
    const result = await this.dependencies.db.query(
      `SELECT a.*,m.ticket_id,m.change_id,m.state FROM mail_attachments a JOIN mail_messages m ON m.id=a.message_id WHERE a.id=$1`,
      [id],
    );
    const file = result.rows[0];
    if (!file) throw new NotFoundException();
    if (!user.roles.includes('ADMIN')) {
      if (!['RECEIVED', 'SENT'].includes(file.state))
        throw new NotFoundException();
      if (file.ticket_id) await this.visible('TICKET', file.ticket_id, user);
      else if (file.change_id)
        await this.visible('CHANGE', file.change_id, user);
      else throw new NotFoundException();
    }
    return file;
  }
}
@Controller('mail')
export class MailRecordController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: MailRecordService,
  ) {}
  @Get('tickets/:id') async ticket(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.timeline('TICKET', id, await this.auth.currentUser(r));
  }
  @Get('changes/:id') async change(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.timeline('CHANGE', id, await this.auth.currentUser(r));
  }
  @Get('review/:id') async reviewDetail(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.reviewDetail(id, await this.auth.currentUser(r));
  }
  @Post('review/:id') async review(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: MailReviewDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.review(id, await this.auth.currentUser(r), b);
  }
  @Post('intake/:id') async intake(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: MailIntakeDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.intake(id, await this.auth.currentUser(r), b);
  }
  @Get('attachments/:id') async attachment(
    @Req() r: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const file = await this.service.attachment(
      id,
      await this.auth.currentUser(r),
    );
    return reply
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(String(file.file_name))}`,
      )
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .type(file.content_type)
      .send(file.content);
  }
}
