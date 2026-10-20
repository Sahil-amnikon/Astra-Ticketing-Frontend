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
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService, type AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';
import { AttachmentDto, CreateTicketDto, TicketService } from './tickets';
import { changeTransaction } from './change-governance-rules';
import { acceptedEmailFile } from './mail-inbox';
import { enqueueNotification } from './notifications';
import { portalGroupAccess } from './group-permissions';
import {
  deleteStoredTicketAttachment,
  readStoredTicketAttachment,
  storeTicketAttachment,
} from './attachment-storage';

export class PortalQuery {
  @IsOptional() @IsString() @MaxLength(200) q = '';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}
export class PortalCreateDto {
  @IsUUID() contactId!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsUUID() categoryId!: string;
  @IsString() @MinLength(3) @MaxLength(300) subject!: string;
  @IsString() @MinLength(3) @MaxLength(20000) description!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments: AttachmentDto[] = [];
}
export class PortalReplyDto {
  @IsString() @MinLength(1) @MaxLength(20000) body!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => AttachmentDto)
  attachments: AttachmentDto[] = [];
}
export class PortalContactLinkDto {
  @IsOptional() @IsUUID() userId?: string;
}
// Identity linkage is explicit. Matching an unverified email or merely knowing a ticket ID grants no access.
export const PORTAL_SCOPE = `(c.user_id=$1 OR ${portalGroupAccess('PORTAL_ORGANIZATION_VIEW')}) AND c.active AND t.client_id=ANY($2::uuid[])
  AND cl.status='ACTIVE' AND cl.organization_type='CLIENT'
  AND (cardinality($3::uuid[])=0 OR t.site_id=ANY($3::uuid[]))`;

@Injectable()
export class ClientPortalService {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly tickets: TicketService,
  ) {}
  async contactAccess(id: string, user: AuthenticatedUser) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException();
    const contact = (
      await this.dependencies.db.query(
        'SELECT id,client_id,user_id,email FROM contacts WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!contact) throw new NotFoundException();
    const users = await this.dependencies.db.query(
      "SELECT u.id,u.display_name AS name,u.email FROM users u JOIN client_users cu ON cu.user_id=u.id WHERE cu.client_id=$1 AND u.active AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code='USER') ORDER BY u.display_name",
      [contact.client_id],
    );
    return { contact, users: users.rows };
  }
  async linkContact(
    id: string,
    user: AuthenticatedUser,
    dto: PortalContactLinkDto,
  ) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException();
    return changeTransaction(this.dependencies, async (db) => {
      const contact = (
        await db.query('SELECT * FROM contacts WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!contact) throw new NotFoundException();
      if (dto.userId) {
        const linked = await db.query(
          'SELECT id FROM contacts WHERE user_id=$1 AND id<>$2',
          [dto.userId, id],
        );
        if (linked.rowCount)
          throw new BadRequestException(
            'This user is already linked to another contact. Edit that contact instead.',
          );
        const allowed = await db.query(
          "SELECT 1 FROM users u JOIN client_users cu ON cu.user_id=u.id WHERE u.id=$1 AND cu.client_id=$2 AND u.active AND lower(u.email)=lower($3) AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code='USER')",
          [dto.userId, contact.client_id, contact.email],
        );
        if (!allowed.rowCount)
          throw new BadRequestException(
            'Choose an active User-role account assigned to this client with the same email address as this contact.',
          );
      }
      await db.query(
        'UPDATE contacts SET user_id=$2,updated_at=now() WHERE id=$1',
        [id, dto.userId ?? null],
      );
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'CONTACT.PORTAL_ACCESS_UPDATED','CONTACT',$2,$3::jsonb)",
        [
          user.id,
          id,
          JSON.stringify({
            beforeUserId: contact.user_id,
            afterUserId: dto.userId ?? null,
          }),
        ],
      );
      return { saved: true };
    });
  }
  private access(user: AuthenticatedUser) {
    if (!user.roles.includes('USER'))
      throw new ForbiddenException(
        'Client portal access must be granted by an administrator.',
      );
  }
  private values(user: AuthenticatedUser) {
    return [user.id, user.clientIds, user.siteIds ?? []];
  }
  async own(
    id: string,
    user: AuthenticatedUser,
    db: Pick<PoolClient, 'query'> = this.dependencies.db,
    lock = false,
  ) {
    this.access(user);
    const row = (
      await db.query(
        `SELECT t.id,t.ticket_number,t.subject,t.description,t.status,t.priority,t.created_at,t.updated_at,t.assigned_user_id,
      cl.name AS client_name,s.name AS site_name,ca.name AS category_name,
      (c.user_id=$1 OR ${portalGroupAccess('PORTAL_ORGANIZATION_REPLY')}) AS can_reply
      FROM tickets t JOIN contacts c ON c.id=t.requester_id JOIN clients cl ON cl.id=t.client_id
      LEFT JOIN sites s ON s.id=t.site_id LEFT JOIN categories ca ON ca.id=t.category_id
      WHERE ${lock ? PORTAL_SCOPE.replace(portalGroupAccess('PORTAL_ORGANIZATION_VIEW'), portalGroupAccess('PORTAL_ORGANIZATION_REPLY')) : PORTAL_SCOPE} AND t.id=$4 ${lock ? 'FOR UPDATE OF t' : ''}`,
        [...this.values(user), id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException();
    return row;
  }
  async options(user: AuthenticatedUser) {
    this.access(user);
    const [contacts, sites, categories] = await Promise.all([
      this.dependencies.db.query(
        "SELECT c.id,c.client_id,c.site_id,c.name,cl.name AS client_name,d.site_id AS routing_site_id FROM contacts c JOIN clients cl ON cl.id=c.client_id LEFT JOIN client_email_domains d ON d.domain=lower(split_part(c.email,'@',2)) AND d.active AND d.client_id=c.client_id WHERE c.user_id=$1 AND c.client_id=ANY($2::uuid[]) AND c.active AND cl.status='ACTIVE' AND cl.organization_type='CLIENT'",
        [user.id, user.clientIds],
      ),
      this.dependencies.db.query(
        'SELECT id,client_id,name FROM sites WHERE active AND client_id=ANY($1::uuid[]) AND (cardinality($2::uuid[])=0 OR id=ANY($2::uuid[])) ORDER BY name',
        [user.clientIds, user.siteIds ?? []],
      ),
      this.dependencies.db.query(
        'SELECT id,name,parent_id FROM categories WHERE active ORDER BY name',
      ),
    ]);
    return {
      contacts: contacts.rows,
      sites: sites.rows,
      categories: categories.rows,
    };
  }
  async list(user: AuthenticatedUser, q: PortalQuery) {
    this.access(user);
    const pattern = `%${q.q.replace(/[\\%_]/g, '\\$&')}%`;
    const result = await this.dependencies.db.query(
      `WITH visible AS (
      SELECT t.id,t.ticket_number,t.subject,t.status,t.priority,t.updated_at,cl.name AS client_name
      FROM tickets t JOIN contacts c ON c.id=t.requester_id JOIN clients cl ON cl.id=t.client_id
      WHERE ${PORTAL_SCOPE} AND ($4='' OR t.subject ILIKE $5 OR t.ticket_number ILIKE $5)
    ) SELECT (SELECT count(*)::int FROM visible) AS total,
      COALESCE((SELECT jsonb_agg(r) FROM (SELECT * FROM visible ORDER BY updated_at DESC LIMIT 20 OFFSET $6) r),'[]') AS items`,
      [...this.values(user), q.q, pattern, (q.page - 1) * 20],
    );
    return { ...result.rows[0], page: q.page };
  }
  async detail(id: string, user: AuthenticatedUser) {
    const ticket = await this.own(id, user);
    const [comments, attachments, sla] = await Promise.all([
      this.dependencies.db.query(
        "SELECT c.id,c.body,c.created_at,u.display_name AS author_name FROM ticket_comments c JOIN users u ON u.id=c.author_user_id WHERE ticket_id=$1 AND comment_type='PUBLIC' ORDER BY c.created_at,c.id",
        [id],
      ),
      this.dependencies.db.query(
        "SELECT id,file_name,content_type,size_bytes,created_at FROM ticket_attachments WHERE ticket_id=$1 AND visibility='PUBLIC' ORDER BY created_at",
        [id],
      ),
      this.dependencies.db.query(
        'SELECT response_due_at,resolution_due_at,response_completed_at,resolution_completed_at,paused_at FROM ticket_sla WHERE ticket_id=$1',
        [id],
      ),
    ]);
    const { assigned_user_id: _assigned, ...publicTicket } = ticket;
    void _assigned;
    return {
      ticket: publicTicket,
      comments: comments.rows,
      attachments: attachments.rows,
      sla: sla.rows[0] ?? null,
    };
  }
  async create(user: AuthenticatedUser, dto: PortalCreateDto) {
    this.access(user);
    return changeTransaction(this.dependencies, async (db) => {
      const contact = (
        await db.query(
          `SELECT c.* FROM contacts c JOIN clients cl ON cl.id=c.client_id WHERE c.id=$1 AND c.user_id=$2 AND c.client_id=ANY($3::uuid[]) AND c.active AND cl.status='ACTIVE' AND cl.organization_type='CLIENT'`,
          [dto.contactId, user.id, user.clientIds],
        )
      ).rows[0];
      if (!contact)
        throw new ForbiddenException(
          'Select a contact linked to your approved account.',
        );
      const routing = (
        await db.query(
          "SELECT client_id,site_id FROM client_email_domains WHERE domain=lower(split_part($1,'@',2)) AND active FOR SHARE",
          [contact.email],
        )
      ).rows[0];
      if (routing && routing.client_id !== contact.client_id)
        throw new BadRequestException(
          'Your contact and email domain belong to different customers. Ask the service desk to review the routing.',
        );
      if (routing?.site_id && dto.siteId && dto.siteId !== routing.site_id)
        throw new BadRequestException(
          'Use the site assigned to your email domain.',
        );
      const siteId =
        routing?.site_id ?? dto.siteId ?? contact.site_id ?? undefined;
      if (user.siteIds?.length && (!siteId || !user.siteIds.includes(siteId)))
        throw new ForbiddenException('Choose one of your assigned sites.');
      if (contact.site_id && siteId !== contact.site_id)
        throw new BadRequestException('Use the site linked to your contact.');
      return this.tickets.create(
        Object.assign(new CreateTicketDto(), {
          clientId: contact.client_id,
          requesterId: contact.id,
          siteId,
          categoryId: dto.categoryId,
          subject: dto.subject,
          description: dto.description,
          source: 'CLIENT_PORTAL',
          priority: 'P3_MEDIUM',
          tagIds: [],
          attachments: dto.attachments.map((a) => ({
            ...a,
            visibility: 'PUBLIC',
          })),
        }),
        user,
        db,
      );
    });
  }
  async reply(id: string, user: AuthenticatedUser, dto: PortalReplyDto) {
    return changeTransaction(this.dependencies, async (db) => {
      const ticket = await this.own(id, user, db, true);
      const comment = (
        await db.query(
          "INSERT INTO ticket_comments(ticket_id,author_user_id,comment_type,body) VALUES($1,$2,'PUBLIC',$3) RETURNING id",
          [id, user.id, dto.body.trim()],
        )
      ).rows[0];
      for (const file of dto.attachments) {
        const content = Buffer.from(file.contentBase64, 'base64');
        if (
          !acceptedEmailFile(file.fileName, file.contentType, content.length) ||
          content.toString('base64').replace(/=+$/, '') !==
            file.contentBase64.replace(/\s|=+$/g, '')
        )
          throw new BadRequestException(
            'Invalid attachment. Use an allowed file type up to 5 MB.',
          );
        const aid = randomUUID();
        const stored = await storeTicketAttachment({
          ticketId: id,
          attachmentId: aid,
          fileName: file.fileName,
          content,
        });
        try {
          await db.query(
            "INSERT INTO ticket_attachments(id,ticket_id,uploaded_by_user_id,file_name,content_type,size_bytes,storage_key,sha256,content,visibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PUBLIC')",
            [
              aid,
              id,
              user.id,
              file.fileName,
              file.contentType,
              content.length,
              stored.storageKey,
              stored.sha256,
              Buffer.alloc(0),
            ],
          );
        } catch (error) {
          await deleteStoredTicketAttachment(stored.storageKey).catch(
            () => undefined,
          );
          throw error;
        }
      }
      // A requester reply is not the technician's first SLA response.
      await db.query('UPDATE tickets SET updated_at=now() WHERE id=$1', [id]);
      await db.query(
        "INSERT INTO ticket_history(ticket_id,actor_user_id,action,new_value) VALUES($1,$2,'TICKET.CLIENT_REPLIED',$3::jsonb)",
        [id, user.id, JSON.stringify({ commentId: comment.id })],
      );
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'TICKET.CLIENT_REPLIED','TICKET',$2,$3::jsonb)",
        [
          user.id,
          id,
          JSON.stringify({
            commentId: comment.id,
            attachmentCount: dto.attachments.length,
          }),
        ],
      );
      if (ticket.assigned_user_id)
        await enqueueNotification(db, {
          userId: ticket.assigned_user_id,
          ticketId: id,
          type: 'PUBLIC_REPLY',
          title: `${ticket.ticket_number} received a client reply`,
          body: ticket.subject,
          eventKey: `portal-reply:${comment.id}`,
        });
      return comment;
    });
  }
  async attachment(ticketId: string, id: string, user: AuthenticatedUser) {
    await this.own(ticketId, user);
    const file = (
      await this.dependencies.db.query(
        "SELECT file_name,content_type,content,storage_key FROM ticket_attachments WHERE id=$1 AND ticket_id=$2 AND visibility='PUBLIC'",
        [id, ticketId],
      )
    ).rows[0];
    if (!file) throw new NotFoundException();
    const content =
      file.content && file.content.length > 0
        ? file.content
        : await readStoredTicketAttachment(file.storage_key);
    return { ...file, content };
  }
}
@Controller('portal')
export class ClientPortalController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: ClientPortalService,
  ) {}
  @Get('access/:id') async contactAccess(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.contactAccess(id, await this.auth.currentUser(r));
  }
  @Patch('access/:id') async linkContact(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: PortalContactLinkDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.linkContact(id, await this.auth.currentUser(r), b);
  }
  @Get('options') async options(@Req() r: FastifyRequest) {
    return this.service.options(await this.auth.currentUser(r));
  }
  @Get('tickets') async list(
    @Req() r: FastifyRequest,
    @Query() q: PortalQuery,
  ) {
    return this.service.list(await this.auth.currentUser(r), q);
  }
  @Post('tickets') async create(
    @Req() r: FastifyRequest,
    @Body() b: PortalCreateDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.create(await this.auth.currentUser(r), b);
  }
  @Get('tickets/:id') async detail(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.detail(id, await this.auth.currentUser(r));
  }
  @Post('tickets/:id/replies') async reply(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: PortalReplyDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.reply(id, await this.auth.currentUser(r), b);
  }
  @Get('tickets/:ticketId/attachments/:id') async attachment(
    @Req() r: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('ticketId', new ParseUUIDPipe()) ticketId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const file = await this.service.attachment(
      ticketId,
      id,
      await this.auth.currentUser(r),
    );
    return reply
      .header(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(String(file.file_name))}`,
      )
      .header('Cache-Control', 'no-store')
      .type(file.content_type)
      .send(file.content);
  }
}
