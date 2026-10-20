import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Query,
  Req,
} from '@nestjs/common';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';
import type { FastifyRequest } from 'fastify';
import { AuthService, type AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';
export class ServiceReportQuery {
  @IsDateString({ strict: true }) from!: string;
  @IsDateString({ strict: true }) to!: string;
  @IsOptional() @IsUUID() clientId?: string;
}
@Injectable()
export class ServiceReportService {
  constructor(private readonly dependencies: Dependencies) {}
  async report(user: AuthenticatedUser, q: ServiceReportQuery) {
    const admin = user.roles.includes('ADMIN');
    if (!admin && !user.permissions?.includes('REPORTS_VIEW'))
      throw new ForbiddenException();
    const start = new Date(q.from),
      end = new Date(q.to);
    end.setUTCDate(end.getUTCDate() + 1);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start ||
      end.getTime() - start.getTime() > 367 * 86400000
    )
      throw new BadRequestException(
        'Choose a date range of no more than one year.',
      );
    if (q.clientId && !admin && !user.clientIds.includes(q.clientId))
      throw new ForbiddenException();
    const values = [
      admin,
      user.clientIds,
      user.siteIds ?? [],
      q.clientId ?? null,
      start.toISOString(),
      end.toISOString(),
    ];
    const scope = `($1::boolean OR client_id=ANY($2::uuid[])) AND ($1::boolean OR cardinality($3::uuid[])=0 OR site_id=ANY($3::uuid[])) AND ($4::uuid IS NULL OR client_id=$4)`;
    const [tickets, sources, changes, knowledge, clients] = await Promise.all([
      this.dependencies.db.query(
        `WITH scoped AS(SELECT * FROM tickets WHERE ${scope}) SELECT
     count(*) FILTER(WHERE created_at >= $5 AND created_at < $6)::int AS created,
     count(*) FILTER(WHERE resolved_at >= $5 AND resolved_at < $6)::int AS resolved,
     count(*) FILTER(WHERE status NOT IN ('RESOLVED','CLOSED','CANCELLED'))::int AS open_now,
     round(avg(extract(epoch FROM(resolved_at-created_at))/3600) FILTER(WHERE resolved_at >= $5 AND resolved_at < $6)::numeric,1) AS average_resolution_hours
     FROM scoped`,
        values,
      ),
      this.dependencies.db.query(
        `SELECT source,count(*)::int AS count FROM tickets WHERE ${scope} AND created_at >= $5 AND created_at < $6 GROUP BY source ORDER BY count DESC`,
        values,
      ),
      admin || (user.changeAccess && user.changeAccess !== 'NONE')
        ? this.dependencies.db.query(
            `SELECT status,count(*)::int AS count FROM changes WHERE ${scope} AND created_at >= $5 AND created_at < $6 GROUP BY status ORDER BY count DESC`,
            values,
          )
        : Promise.resolve({ rows: [] }),
      this.dependencies.db.query(
        `SELECT count(*)::int AS article_links FROM ticket_knowledge_links l JOIN tickets t ON t.id=l.ticket_id WHERE ($1::boolean OR t.client_id=ANY($2::uuid[])) AND ($1::boolean OR cardinality($3::uuid[])=0 OR t.site_id=ANY($3::uuid[])) AND ($4::uuid IS NULL OR t.client_id=$4) AND l.created_at >= $5 AND l.created_at < $6`,
        values,
      ),
      this.dependencies.db.query(
        'SELECT id,name FROM clients WHERE $1::boolean OR id=ANY($2::uuid[]) ORDER BY name',
        [admin, user.clientIds],
      ),
    ]);
    return {
      from: q.from,
      to: q.to,
      clientId: q.clientId ?? null,
      tickets: tickets.rows[0],
      sources: sources.rows,
      changes: changes.rows,
      knowledge: knowledge.rows[0],
      clients: clients.rows,
    };
  }
}
@Controller('service-reports')
export class ServiceReportController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: ServiceReportService,
  ) {}
  @Get() async report(
    @Req() r: FastifyRequest,
    @Query() q: ServiceReportQuery,
  ) {
    return this.service.report(await this.auth.currentUser(r), q);
  }
}
