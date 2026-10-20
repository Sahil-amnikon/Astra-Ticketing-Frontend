import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { domainToASCII } from 'node:url';
import { Dependencies } from './dependencies';
import { AuthService } from './auth';
import { TicketService } from './tickets';
import { readConfig } from './config';
import { loadMailSettings, smtpTransport } from './mail-settings';

const COOKIE = 'astra_support_session';
const COOKIE_PATH = '/api/support';
const OTP_TTL = 600;
const SESSION_TTL = 3600;
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const publicProviders = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'icloud.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'mail.com',
]);
export function normalizedDomain(value: string) {
  if (/[\s/\\:@?#%*]/.test(value.trim()))
    throw new BadRequestException('Enter a domain without URLs or wildcards.');
  const domain = domainToASCII(value.trim().toLowerCase());
  if (
    !domain ||
    domain.length > 253 ||
    !domain.includes('.') ||
    domain
      .split('.')
      .some((s) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s))
  )
    throw new BadRequestException(
      'Enter a domain such as example.com, without @, URLs or wildcards.',
    );
  return domain;
}
export function normalizedPortalEmail(value: string) {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at < 1 || email.length > 254 || !/^[^\s@]+$/.test(email.slice(0, at)))
    throw new BadRequestException('Enter your work email address.');
  return `${email.slice(0, at)}@${normalizedDomain(email.slice(at + 1))}`;
}
export const OTP_CHECK = `
 local stored=redis.call('GET',KEYS[1]); if not stored then return false end
 local v=cjson.decode(stored); v.attempts=v.attempts+1
 if v.attempts>5 then redis.call('DEL',KEYS[1]); return false end
 if v.digest~=ARGV[1] then
   if v.attempts>=5 then redis.call('DEL',KEYS[1]) else
     local ttl=redis.call('TTL',KEYS[1]); if ttl>0 then redis.call('SET',KEYS[1],cjson.encode(v),'EX',ttl) end
   end
   return false
 end
 redis.call('DEL',KEYS[1]); return stored`;
export const RATE_CHECK = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n`;

type Rule = {
  id: string;
  client_id: string;
  domain: string;
  site_id: string | null;
  revision: number;
  client_name: string;
  ticket_prefix: string;
};
type Identity = {
  email: string;
  ruleId: string;
  clientId: string;
  revision: number;
  csrfToken: string;
};
type Challenge = {
  digest: string;
  email: string;
  ruleId: string | null;
  revision: number | null;
  attempts: number;
};
export class PortalEmailDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class PortalCodeDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) challenge!: string;
  @IsString() @Matches(/^\d{6}$/) code!: string;
}
export class SupportTicketDto {
  @IsUUID() requestId!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsUUID() categoryId!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsString() @MinLength(3) @MaxLength(200) subject!: string;
  @IsString() @MinLength(3) @MaxLength(10000) description!: string;
}
export class DomainRuleDto {
  @IsUUID() clientId!: string;
  @IsString() @MaxLength(253) domain!: string;
  @IsOptional() @IsUUID() siteId?: string | null;
  @IsBoolean() active!: boolean;
  @IsOptional() @IsInt() @Min(1) revision?: number;
}
export class DomainListQuery {
  @IsOptional() @IsUUID() siteId?: string;
}
@Injectable()
export class SupportPortalService {
  private readonly config = readConfig();
  constructor(
    private readonly deps: Dependencies,
    private readonly tickets: TicketService,
  ) {}
  private digest(value: string) {
    if (!this.config.MAIL_CONFIG_KEY)
      throw new ServiceUnavailableException(
        'Email verification is unavailable.',
      );
    return createHmac('sha256', Buffer.from(this.config.MAIL_CONFIG_KEY, 'hex'))
      .update(`astra-support-v1:${value}`)
      .digest('hex');
  }
  private async redis() {
    if (this.deps.redis.status === 'wait' || this.deps.redis.status === 'end')
      await this.deps.redis.connect();
    return this.deps.redis;
  }
  private async limit(key: string, maximum: number, seconds: number) {
    const redis = await this.redis();
    const count = Number(
      await redis.eval(RATE_CHECK, 1, `support:rate:${hash(key)}`, seconds),
    );
    if (count > maximum)
      throw new HttpException('Please wait before trying again.', 429);
  }
  origin(request: FastifyRequest) {
    if (request.headers.origin !== new URL(this.config.APP_BASE_URL).origin)
      throw new ForbiddenException();
  }
  private async rule(domain: string): Promise<Rule | undefined> {
    return (
      await this.deps.db.query<Rule>(
        `SELECT d.*,c.name client_name,COALESCE(s.ticket_prefix,c.ticket_prefix) AS ticket_prefix FROM client_email_domains d JOIN clients c ON c.id=d.client_id LEFT JOIN sites s ON s.id=d.site_id AND s.client_id=d.client_id WHERE d.domain=$1 AND d.active AND c.status='ACTIVE' AND c.organization_type='CLIENT' AND (d.site_id IS NULL OR s.active)`,
        [domain],
      )
    ).rows[0];
  }
  async sendCode(value: string) {
    const email = normalizedPortalEmail(value),
      domain = email.split('@')[1]!;
    // Bound code regeneration as well as guessing. No caller-supplied IP header is trusted.
    await this.limit('global-delivery', 300, 3600);
    await this.limit(`domain:${domain}`, 60, 3600);
    await this.limit(`email:${email}`, 5, 3600);
    await this.limit(`cooldown:${email}`, 1, 60);
    const rule = await this.rule(domain);
    const challenge = randomBytes(32).toString('hex');
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const redis = await this.redis();
    const key = `support:challenge:${hash(challenge)}`;
    const record: Challenge = {
      email,
      ruleId: rule?.id ?? null,
      revision: rule?.revision ?? null,
      digest: this.digest(`${challenge}:${code}`),
      attempts: 0,
    };
    await redis.set(key, JSON.stringify(record), 'EX', OTP_TTL);
    if (rule) {
      try {
        const settings = await loadMailSettings(this.deps);
        if (!settings.enabled) throw new Error('MAIL_DISABLED');
        const transport = smtpTransport(settings);
        try {
          await transport.sendMail({
            from: settings.ticket_address,
            to: email,
            subject: 'Your ASTRA support verification code',
            text: `Your ASTRA support verification code is ${code}.\n\nIt expires in 10 minutes and can be used once. Enter it only on the ASTRA support page. If you did not request it, ignore this email.`,
          });
        } finally {
          transport.close();
        }
      } catch {
        await redis.del(key);
        throw new ServiceUnavailableException(
          'Email verification is temporarily unavailable.',
        );
      }
    }
    // Do not disclose the client or whether an individual contact exists before verification.
    return {
      challenge,
      expiresIn: OTP_TTL,
      message:
        'If your work email domain is enabled for support, a code will arrive. Check your spam folder or contact your service desk if it does not.',
    };
  }
  async verify(dto: PortalCodeDto) {
    await this.limit('global-verification', 3000, 3600);
    const redis = await this.redis();
    const consumed = await redis.eval(
      OTP_CHECK,
      1,
      `support:challenge:${hash(dto.challenge)}`,
      this.digest(`${dto.challenge}:${dto.code}`),
    );
    if (typeof consumed !== 'string')
      throw new BadRequestException(
        'The code is incorrect, expired or already used. Request a new code.',
      );
    const verified = JSON.parse(consumed) as Challenge;
    const rule = await this.rule(verified.email.split('@')[1]!);
    if (
      !rule ||
      rule.id !== verified.ruleId ||
      rule.revision !== verified.revision
    )
      throw new BadRequestException(
        'Support access is unavailable for this email. Contact your service desk.',
      );
    const token = randomBytes(32).toString('hex');
    const identity: Identity = {
      email: verified.email,
      ruleId: rule.id,
      clientId: rule.client_id,
      revision: rule.revision,
      csrfToken: randomBytes(32).toString('hex'),
    };
    await redis.set(
      `support:session:${hash(token)}`,
      JSON.stringify(identity),
      'EX',
      SESSION_TTL,
    );
    return { token, identity };
  }
  cookie(token: string, maxAge = SESSION_TTL) {
    return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=${maxAge}${new URL(this.config.APP_BASE_URL).protocol === 'https:' ? '; Secure' : ''}`;
  }
  private token(request: FastifyRequest) {
    const raw = request.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
    if (!raw || !/^[a-f0-9]{64}$/.test(raw)) throw new UnauthorizedException();
    return raw;
  }
  async identity(request: FastifyRequest, mutate = false) {
    const redis = await this.redis();
    const key = `support:session:${hash(this.token(request))}`;
    const raw = await redis.get(key);
    if (!raw) throw new UnauthorizedException();
    const identity = JSON.parse(raw) as Identity;
    const rule = await this.rule(identity.email.split('@')[1]!);
    if (
      !rule ||
      rule.id !== identity.ruleId ||
      rule.client_id !== identity.clientId ||
      rule.revision !== identity.revision
    ) {
      await redis.del(key);
      throw new UnauthorizedException();
    }
    if (mutate) {
      this.origin(request);
      const provided = request.headers['x-csrf-token'];
      const actual =
        typeof provided === 'string' ? Buffer.from(provided) : null;
      const expected = Buffer.from(identity.csrfToken);
      if (
        !actual ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw new ForbiddenException();
    }
    return { identity, rule };
  }
  async options(request: FastifyRequest) {
    const { identity, rule } = await this.identity(request);
    const [categories, sites] = await Promise.all([
      this.deps.db.query(
        'SELECT id,name FROM categories WHERE active ORDER BY name',
      ),
      this.deps.db.query(
        'SELECT id,name,ticket_prefix FROM sites WHERE client_id=$1 AND active AND ($2::uuid IS NULL OR id=$2) ORDER BY name',
        [rule.client_id, rule.site_id],
      ),
    ]);
    return {
      email: identity.email,
      csrfToken: identity.csrfToken,
      client: { name: rule.client_name, ticketPrefix: rule.ticket_prefix },
      fixedSiteId: rule.site_id,
      categories: categories.rows,
      sites: sites.rows,
    };
  }
  async submit(request: FastifyRequest, dto: SupportTicketDto) {
    const { identity, rule } = await this.identity(request, true);
    await this.limit(`submit:${identity.email}`, 10, 3600);
    if (
      dto.name.trim().length < 2 ||
      dto.subject.trim().length < 3 ||
      dto.description.trim().length < 3
    )
      throw new BadRequestException('Complete the required fields.');
    if (rule.site_id && dto.siteId && dto.siteId !== rule.site_id)
      throw new BadRequestException(
        'The selected site does not belong to your support access.',
      );
    const db = await this.deps.db.connect();
    try {
      await db.query('BEGIN');
      // Serialize retries and simultaneous first contact creation for the verified mailbox.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `support:${rule.client_id}:${identity.email}`,
      ]);
      const current = (
        await db.query<Rule>(
          'SELECT * FROM client_email_domains WHERE id=$1 AND client_id=$2 AND active AND revision=$3 FOR SHARE',
          [rule.id, identity.clientId, identity.revision],
        )
      ).rows[0];
      if (!current) throw new UnauthorizedException();
      if (
        !(
          await db.query(
            "SELECT 1 FROM clients WHERE id=$1 AND status='ACTIVE' AND organization_type='CLIENT' FOR SHARE",
            [identity.clientId],
          )
        ).rowCount
      )
        throw new UnauthorizedException();
      const previous = (
        await db.query(
          `SELECT p.requester_email,p.client_id,t.id,t.ticket_number FROM portal_ticket_submissions p JOIN tickets t ON t.id=p.ticket_id WHERE p.request_id=$1`,
          [dto.requestId],
        )
      ).rows[0];
      if (previous) {
        if (
          previous.requester_email !== identity.email ||
          previous.client_id !== identity.clientId
        )
          throw new ForbiddenException();
        await db.query('COMMIT');
        return { id: previous.id, ticket_number: previous.ticket_number };
      }
      const contacts = await db.query<{
        id: string;
        site_id: string | null;
        active: boolean;
      }>(
        'SELECT id,site_id,active FROM contacts WHERE client_id=$1 AND lower(email)=$2 ORDER BY id',
        [rule.client_id, identity.email],
      );
      if (contacts.rows.length > 1)
        throw new BadRequestException(
          'Your service desk needs to review duplicate contact records before you can submit.',
        );
      if (contacts.rows[0] && !contacts.rows[0].active)
        throw new BadRequestException(
          'Your contact record is disabled. Contact your service desk.',
        );
      const siteId = rule.site_id ?? contacts.rows[0]?.site_id ?? dto.siteId;
      if (
        contacts.rows[0]?.site_id &&
        (siteId !== contacts.rows[0].site_id ||
          (dto.siteId && dto.siteId !== contacts.rows[0].site_id))
      )
        throw new BadRequestException(
          'Your contact and domain site settings need review by the service desk.',
        );
      const contact =
        contacts.rows[0] ??
        (
          await db.query<{ id: string }>(
            'INSERT INTO contacts(client_id,site_id,name,email) VALUES($1,$2,$3,$4) RETURNING id',
            [rule.client_id, siteId ?? null, dto.name.trim(), identity.email],
          )
        ).rows[0];
      if (!contact)
        throw new BadRequestException('Contact could not be created.');
      const ticket = await this.tickets.createVerifiedPortalTicket(
        {
          clientId: rule.client_id,
          requesterId: contact.id,
          siteId: siteId ?? undefined,
          categoryId: dto.categoryId,
          subject: dto.subject,
          description: dto.description,
          source: 'CLIENT_PORTAL',
          priority: 'P3_MEDIUM',
          tagIds: [],
        },
        db,
      );
      await db.query(
        'INSERT INTO portal_ticket_submissions(request_id,domain_rule_id,client_id,requester_email,ticket_id) VALUES($1,$2,$3,$4,$5)',
        [dto.requestId, rule.id, rule.client_id, identity.email, ticket.id],
      );
      await db.query(
        `INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES(NULL,'PORTAL.TICKET_SUBMITTED','TICKET',$1,$2::jsonb)`,
        [
          ticket.id,
          JSON.stringify({
            verifiedEmail: identity.email,
            clientId: rule.client_id,
            domainRuleId: rule.id,
            identityMethod: 'EMAIL_CODE',
          }),
        ],
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
  async logout(request: FastifyRequest) {
    await this.identity(request, true);
    await (
      await this.redis()
    ).del(`support:session:${hash(this.token(request))}`);
  }
}

@Controller('support')
export class SupportPortalController {
  constructor(private readonly portal: SupportPortalService) {}
  @Post('code') async code(
    @Req() req: FastifyRequest,
    @Body() dto: PortalEmailDto,
  ) {
    this.portal.origin(req);
    return this.portal.sendCode(dto.email);
  }
  @Post('verify') async verify(
    @Req() req: FastifyRequest,
    @Body() dto: PortalCodeDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.portal.origin(req);
    const result = await this.portal.verify(dto);
    reply.header('set-cookie', this.portal.cookie(result.token));
    return { verified: true };
  }
  @Get('options') options(@Req() req: FastifyRequest) {
    return this.portal.options(req);
  }
  @Post('tickets') submit(
    @Req() req: FastifyRequest,
    @Body() dto: SupportTicketDto,
  ) {
    return this.portal.submit(req, dto);
  }
  @Post('logout') async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    await this.portal.logout(req);
    reply.header('set-cookie', this.portal.cookie('', 0));
    return { signedOut: true };
  }
}

@Injectable()
export class ClientDomainService {
  constructor(private readonly deps: Dependencies) {}
  async list(siteId?: string) {
    const [domains, clients, sites, mail] = await Promise.all([
      this.deps.db.query(
        'SELECT d.*,c.name client_name,COALESCE(s.ticket_prefix,c.ticket_prefix) AS ticket_prefix,s.name site_name FROM client_email_domains d JOIN clients c ON c.id=d.client_id LEFT JOIN sites s ON s.id=d.site_id WHERE ($1::uuid IS NULL OR d.site_id=$1) ORDER BY c.name,d.domain',
        [siteId ?? null],
      ),
      this.deps.db.query(
        "SELECT id,name,ticket_prefix FROM clients WHERE status='ACTIVE' AND organization_type='CLIENT' ORDER BY name",
      ),
      this.deps.db.query(
        'SELECT id,name,client_id FROM sites WHERE active ORDER BY name',
      ),
      this.deps.db.query(
        'SELECT enabled,(smtp_username IS NOT NULL AND password_ciphertext IS NOT NULL) configured FROM mail_settings WHERE id=1',
      ),
    ]);
    return {
      domains: domains.rows,
      clients: clients.rows,
      sites: sites.rows,
      emailEnabled: !!mail.rows[0]?.enabled,
      emailConfigured: !!mail.rows[0]?.configured,
      portalPath: '/support',
    };
  }
  async save(dto: DomainRuleDto, actorId: string, id?: string) {
    const domain = normalizedDomain(dto.domain);
    if (publicProviders.has(domain))
      throw new BadRequestException(
        'Shared personal email provider domains cannot identify a client. Use a client-owned work domain.',
      );
    const db = await this.deps.db.connect();
    try {
      await db.query('BEGIN');
      if (
        !(
          await db.query(
            "SELECT 1 FROM clients WHERE id=$1 AND status='ACTIVE' AND organization_type='CLIENT'",
            [dto.clientId],
          )
        ).rowCount
      )
        throw new BadRequestException('Choose an active client organization.');
      if (
        dto.siteId &&
        !(
          await db.query(
            'SELECT 1 FROM sites WHERE id=$1 AND client_id=$2 AND active',
            [dto.siteId, dto.clientId],
          )
        ).rowCount
      )
        throw new BadRequestException(
          'Choose a site belonging to this client.',
        );
      const before = id
        ? (
            await db.query(
              'SELECT * FROM client_email_domains WHERE id=$1 FOR UPDATE',
              [id],
            )
          ).rows[0]
        : null;
      if (id && !before)
        throw new BadRequestException('Domain rule not found.');
      if (
        before &&
        dto.revision !== undefined &&
        dto.revision !== before.revision
      )
        throw new BadRequestException(
          'This domain routing changed. Reload it before saving.',
        );
      if (before && before.client_id !== dto.clientId)
        throw new BadRequestException(
          'A domain rule cannot be moved to another client. Disable this rule and contact the platform administrator to review a client transfer.',
        );
      const row = id
        ? (
            await db.query(
              'UPDATE client_email_domains SET client_id=$2,domain=$3,site_id=$4,active=$5,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *',
              [id, dto.clientId, domain, dto.siteId ?? null, dto.active],
            )
          ).rows[0]
        : (
            await db.query(
              'INSERT INTO client_email_domains(client_id,domain,site_id,active) VALUES($1,$2,$3,$4) RETURNING *',
              [dto.clientId, domain, dto.siteId ?? null, dto.active],
            )
          ).rows[0];
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'CLIENT.PORTAL_DOMAIN_SAVED','CLIENT_EMAIL_DOMAIN',$2,$3::jsonb)",
        [actorId, row.id, JSON.stringify({ previous: before, next: row })],
      );
      await db.query('COMMIT');
      return row;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
}
@Controller('admin/client-domains')
export class ClientDomainController {
  constructor(
    private readonly auth: AuthService,
    private readonly domains: ClientDomainService,
  ) {}
  @Get() async list(
    @Req() req: FastifyRequest,
    @Query() query: DomainListQuery = {},
  ) {
    await this.auth.requireRoles(req, ['ADMIN']);
    return this.domains.list(query.siteId);
  }
  @Post() async create(@Req() req: FastifyRequest, @Body() dto: DomainRuleDto) {
    const actor = await this.auth.requireRoles(req, ['ADMIN']);
    await this.auth.verifyCsrf(req);
    return this.domains.save(dto, actor.id);
  }
  @Patch(':id') async update(
    @Req() req: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DomainRuleDto,
  ) {
    const actor = await this.auth.requireRoles(req, ['ADMIN']);
    await this.auth.verifyCsrf(req);
    return this.domains.save(dto, actor.id, id);
  }
}
