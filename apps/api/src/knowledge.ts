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
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
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
import { AuthService, type AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';
import { TicketService } from './tickets';
import type { PoolClient } from 'pg';
import { changeTransaction } from './change-governance-rules';
export class KnowledgeQuery {
  @IsOptional() @IsString() @MaxLength(200) q = '';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
}
export class ArticleDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(10) @MaxLength(50000) body!: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsIn(['STAFF', 'CLIENT']) visibility!: 'STAFF' | 'CLIENT';
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']) status!:
    'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  @IsOptional() @IsInt() @Min(1) revision?: number;
}
export class ServiceTemplateDto {
  @IsString() @MinLength(3) @MaxLength(200) name!: string;
  @IsString() @MinLength(3) @MaxLength(5000) description!: string;
  @IsString() @MinLength(3) @MaxLength(20000) instructions!: string;
  @IsUUID() categoryId!: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsBoolean() active = true;
}
export class LinkArticleDto {
  @IsUUID() ticketId!: string;
}
@Injectable()
export class KnowledgeService {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly tickets: TicketService,
  ) {}
  private staff(user: AuthenticatedUser) {
    return user.roles.some((r) =>
      ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'].includes(r),
    );
  }
  private manager(user: AuthenticatedUser) {
    return user.roles.some((r) => ['MANAGER', 'ADMIN'].includes(r));
  }
  private scope(user: AuthenticatedUser, client?: string) {
    if (
      !this.manager(user) ||
      (!user.roles.includes('ADMIN') &&
        (!client || !user.clientIds.includes(client)))
    )
      throw new ForbiddenException(
        'Only administrators can manage global content; managers can manage their assigned clients.',
      );
  }
  private async audit(
    user: AuthenticatedUser,
    action: string,
    id: string,
    details: object,
    db: Pick<PoolClient, 'query'> = this.dependencies.db,
  ) {
    await db.query(
      "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'KNOWLEDGE',$3,$4::jsonb)",
      [user.id, action, id, JSON.stringify(details)],
    );
  }
  async list(user: AuthenticatedUser, q: KnowledgeQuery, id?: string) {
    if (!this.staff(user) && !user.roles.includes('USER'))
      throw new ForbiddenException();
    const pattern = `%${q.q.replace(/[\\%_]/g, '\\$&')}%`;
    const result = await this.dependencies.db.query(
      `WITH visible AS (
      SELECT a.id,a.title,a.body,a.category_id,a.client_id,a.visibility,a.status,a.revision,a.updated_at,u.display_name AS author_name,c.name AS category_name
      FROM knowledge_articles a JOIN users u ON u.id=a.author_user_id LEFT JOIN categories c ON c.id=a.category_id
      WHERE ($1::boolean OR a.client_id IS NULL OR a.client_id=ANY($2::uuid[]))
        AND ($3::boolean OR (a.status='PUBLISHED' AND ($4::boolean OR a.visibility='CLIENT')))
        AND ($5='' OR a.title ILIKE $6 OR to_tsvector('simple',a.title || ' ' || a.body) @@ plainto_tsquery('simple',$5))
        AND ($7::uuid IS NULL OR a.id=$7)
    ) SELECT (SELECT count(*)::int FROM visible) total,COALESCE((SELECT jsonb_agg(r) FROM (SELECT * FROM visible ORDER BY updated_at DESC LIMIT 20 OFFSET $8) r),'[]') items`,
      [
        user.roles.includes('ADMIN'),
        user.clientIds,
        this.manager(user),
        this.staff(user),
        q.q,
        pattern,
        id ?? null,
        (q.page - 1) * 20,
      ],
    );
    if (id) {
      const row = result.rows[0]?.items?.[0];
      if (!row) throw new NotFoundException();
      return row;
    }
    return {
      ...result.rows[0],
      canManage: this.manager(user),
      isAdmin: user.roles.includes('ADMIN'),
    };
  }
  async save(user: AuthenticatedUser, dto: ArticleDto, id?: string) {
    this.scope(user, dto.clientId);
    if (id) {
      const old = await this.list(user, new KnowledgeQuery(), id);
      this.scope(user, old.client_id ?? undefined);
      if (!dto.revision)
        throw new BadRequestException('Reload the article before editing.');
    }
    return changeTransaction(this.dependencies, async (db) => {
      const values = [
        dto.title.trim(),
        dto.body.trim(),
        dto.categoryId ?? null,
        dto.clientId ?? null,
        dto.visibility,
        dto.status,
      ];
      const result = id
        ? await db.query(
            'UPDATE knowledge_articles SET title=$1,body=$2,category_id=$3,client_id=$4,visibility=$5,status=$6,revision=revision+1,updated_at=now() WHERE id=$7 AND revision=$8 RETURNING id',
            [...values, id, dto.revision],
          )
        : await db.query(
            'INSERT INTO knowledge_articles(title,body,category_id,client_id,visibility,status,author_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [...values, user.id],
          );
      if (!result.rows[0])
        throw new BadRequestException(
          'Article changed since you opened it. Reload before saving.',
        );
      await this.audit(
        user,
        'KNOWLEDGE.ARTICLE_SAVED',
        result.rows[0].id,
        {
          title: dto.title,
          status: dto.status,
          visibility: dto.visibility,
          clientId: dto.clientId,
        },
        db,
      );
      return result.rows[0];
    });
  }
  async catalogue(user: AuthenticatedUser) {
    const result = await this.dependencies.db.query(
      `SELECT s.*,c.name AS category_name FROM service_templates s JOIN categories c ON c.id=s.category_id
      WHERE ($1::boolean OR s.client_id IS NULL OR s.client_id=ANY($2::uuid[])) AND ($3::boolean OR s.active) ORDER BY s.name LIMIT 200`,
      [user.roles.includes('ADMIN'), user.clientIds, this.manager(user)],
    );
    return {
      items: result.rows,
      canManage: this.manager(user),
      isAdmin: user.roles.includes('ADMIN'),
    };
  }
  async saveTemplate(
    user: AuthenticatedUser,
    dto: ServiceTemplateDto,
    id?: string,
  ) {
    this.scope(user, dto.clientId);
    return changeTransaction(this.dependencies, async (db) => {
      if (id) {
        const old = (
          await db.query(
            'SELECT client_id FROM service_templates WHERE id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0];
        if (!old) throw new NotFoundException();
        this.scope(user, old.client_id ?? undefined);
      }
      const fields = [
        dto.name.trim(),
        dto.description.trim(),
        dto.instructions.trim(),
        dto.categoryId,
        dto.clientId ?? null,
        dto.active,
      ];
      const result = id
        ? await db.query(
            'UPDATE service_templates SET name=$1,description=$2,instructions=$3,category_id=$4,client_id=$5,active=$6,updated_at=now() WHERE id=$7 RETURNING id',
            [...fields, id],
          )
        : await db.query(
            'INSERT INTO service_templates(name,description,instructions,category_id,client_id,active,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [...fields, user.id],
          );
      await this.audit(
        user,
        'SERVICE.TEMPLATE_SAVED',
        result.rows[0].id,
        {
          name: dto.name,
          active: dto.active,
        },
        db,
      );
      return result.rows[0];
    });
  }
  async options(user: AuthenticatedUser) {
    const [clients, categories] = await Promise.all([
      this.dependencies.db.query(
        "SELECT id,name FROM clients WHERE status='ACTIVE' AND ($1::boolean OR id=ANY($2::uuid[])) ORDER BY name",
        [user.roles.includes('ADMIN'), user.clientIds],
      ),
      this.dependencies.db.query(
        'SELECT id,name FROM categories WHERE active ORDER BY name',
      ),
    ]);
    return { clients: clients.rows, categories: categories.rows };
  }
  async link(user: AuthenticatedUser, id: string, ticketId: string) {
    if (!this.staff(user)) throw new ForbiddenException();
    const article = await this.list(user, new KnowledgeQuery(), id);
    const detail = await this.tickets.detail(ticketId, user);
    if (article.client_id && article.client_id !== detail.ticket.client_id)
      throw new BadRequestException('Article belongs to another client.');
    return changeTransaction(this.dependencies, async (db) => {
      await db.query(
        'INSERT INTO ticket_knowledge_links(ticket_id,article_id,linked_by_user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [ticketId, id, user.id],
      );
      await this.audit(
        user,
        'KNOWLEDGE.LINKED_TO_TICKET',
        id,
        { ticketId },
        db,
      );
      return { linked: true };
    });
  }
}
@Controller('knowledge')
export class KnowledgeController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: KnowledgeService,
  ) {}
  @Get('options') async options(@Req() r: FastifyRequest) {
    return this.service.options(await this.auth.currentUser(r));
  }
  @Get('catalogue') async catalogue(@Req() r: FastifyRequest) {
    return this.service.catalogue(await this.auth.currentUser(r));
  }
  @Post('catalogue') async createTemplate(
    @Req() r: FastifyRequest,
    @Body() b: ServiceTemplateDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.saveTemplate(await this.auth.currentUser(r), b);
  }
  @Patch('catalogue/:id') async editTemplate(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ServiceTemplateDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.saveTemplate(await this.auth.currentUser(r), b, id);
  }
  @Get() async list(@Req() r: FastifyRequest, @Query() q: KnowledgeQuery) {
    return this.service.list(await this.auth.currentUser(r), q);
  }
  @Post() async create(@Req() r: FastifyRequest, @Body() b: ArticleDto) {
    await this.auth.verifyCsrf(r);
    return this.service.save(await this.auth.currentUser(r), b);
  }
  @Get(':id') async detail(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.list(
      await this.auth.currentUser(r),
      new KnowledgeQuery(),
      id,
    );
  }
  @Patch(':id') async edit(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ArticleDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.save(await this.auth.currentUser(r), b, id);
  }
  @Post(':id/tickets') async link(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: LinkArticleDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.link(await this.auth.currentUser(r), id, b.ticketId);
  }
}
