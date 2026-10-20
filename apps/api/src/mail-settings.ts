import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { FastifyRequest } from 'fastify';
import { AuthService, type AuthenticatedUser } from './auth';
import { readConfig } from './config';
import { Dependencies } from './dependencies';

export interface MailSettings {
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  tls_mode: 'TLS' | 'STARTTLS';
  smtp_username: string;
  password_ciphertext: string | null;
  ticket_address: string;
  change_address: string;
  inbound_provider: 'DISABLED' | 'MICROSOFT_365';
  inbound_since: string | null;
}
export const SMTP_HOSTS = [
  'mail.smtp2go.com',
  'mail-us.smtp2go.com',
  'mail-eu.smtp2go.com',
  'mail-eu2.smtp2go.com',
  'mail-au.smtp2go.com',
];
// DNS names only: no URLs, credentials, paths, or arbitrary service ports.
export const SMTP_HOST_PATTERN =
  /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
export function validSmtpEndpoint(host: string, port: number, mode: string) {
  return (
    SMTP_HOST_PATTERN.test(host) &&
    [465, 587, 2525].includes(port) &&
    (port === 465 ? mode === 'TLS' : mode === 'STARTTLS')
  );
}
export function protectMailSecret(
  plain: string,
  key = readConfig().MAIL_CONFIG_KEY,
) {
  if (!key)
    throw new BadRequestException(
      'Mail encryption key is not configured. Run the release configuration helper first.',
    );
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAAD(Buffer.from('amnikon:smtp-password:v1'));
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    encrypted.toString('base64'),
  ].join('.');
}
export function revealMailSecret(
  value: string,
  key = readConfig().MAIL_CONFIG_KEY,
) {
  if (!key) throw new Error('MAIL_KEY_MISSING');
  const [version, iv, tag, data] = value.split('.');
  if (version !== 'v1' || !iv || !tag || !data)
    throw new Error('MAIL_SECRET_INVALID');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAAD(Buffer.from('amnikon:smtp-password:v1'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
export async function loadMailSettings(
  dependencies: Dependencies,
): Promise<MailSettings> {
  const row = (
    await dependencies.db.query<MailSettings>(
      'SELECT * FROM mail_settings WHERE id=1',
    )
  ).rows[0];
  if (!row) throw new Error('MAIL_SETTINGS_MISSING');
  return row;
}
export function smtpTransport(settings: MailSettings) {
  if (
    !validSmtpEndpoint(
      settings.smtp_host,
      settings.smtp_port,
      settings.tls_mode,
    )
  )
    throw new Error('SMTP_ENDPOINT_INVALID');
  if (!settings.password_ciphertext || !settings.smtp_username)
    throw new BadRequestException('Save the SMTP username and password first.');
  return nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.tls_mode === 'TLS',
    requireTLS: settings.tls_mode !== 'TLS',
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: {
      user: settings.smtp_username,
      pass: revealMailSecret(settings.password_ciphertext),
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
export class SaveMailSettingsDto {
  @IsBoolean() enabled!: boolean;
  @IsString() @MaxLength(253) @Matches(SMTP_HOST_PATTERN) smtpHost!: string;
  @IsInt() @IsIn([465, 587, 2525]) smtpPort!: number;
  @IsIn(['STARTTLS', 'TLS']) tlsMode!: 'STARTTLS' | 'TLS';
  @IsString() @MaxLength(300) smtpUsername!: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000) password?: string;
  @IsEmail() @MaxLength(320) ticketAddress!: string;
  @IsEmail() @MaxLength(320) changeAddress!: string;
  @IsIn(['DISABLED', 'MICROSOFT_365']) inboundProvider!:
    'DISABLED' | 'MICROSOFT_365';
}
export class MailTestDto {
  @IsIn(['TICKET']) channel!: 'TICKET';
}

@Injectable()
export class MailSettingsService {
  constructor(private readonly dependencies: Dependencies) {}
  private admin(user: AuthenticatedUser) {
    if (!user.roles.includes('ADMIN')) throw new ForbiddenException();
  }
  async settings(user: AuthenticatedUser) {
    this.admin(user);
    const s = await loadMailSettings(this.dependencies);
    const config = readConfig();
    return {
      enabled: s.enabled,
      smtpHost: s.smtp_host,
      smtpPort: s.smtp_port,
      tlsMode: s.tls_mode,
      smtpUsername: s.smtp_username,
      passwordSaved: Boolean(s.password_ciphertext),
      ticketAddress: s.ticket_address,
      changeAddress: s.change_address,
      inboundProvider: s.inbound_provider,
      inboundSince: s.inbound_since,
      encryptionReady: Boolean(config.MAIL_CONFIG_KEY),
      microsoftConfigured: Boolean(
        config.ENTRA_TENANT_ID &&
        config.ENTRA_CLIENT_ID &&
        config.ENTRA_CLIENT_SECRET,
      ),
    };
  }
  async save(user: AuthenticatedUser, dto: SaveMailSettingsDto) {
    this.admin(user);
    const config = readConfig();
    if (dto.ticketAddress.toLowerCase() === dto.changeAddress.toLowerCase())
      throw new BadRequestException('Use separate ticket and change inboxes.');
    if ((dto.smtpPort === 465) !== (dto.tlsMode === 'TLS'))
      throw new BadRequestException('Use TLS on 465, or STARTTLS on 587/2525.');
    if (
      dto.inboundProvider === 'MICROSOFT_365' &&
      (!config.ENTRA_TENANT_ID ||
        !config.ENTRA_CLIENT_ID ||
        !config.ENTRA_CLIENT_SECRET)
    )
      throw new BadRequestException(
        'Microsoft 365 mailbox access needs configured Entra application credentials and mailbox-scoped mail-read permission.',
      );
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const before = (
        await db.query<MailSettings>(
          'SELECT * FROM mail_settings WHERE id=1 FOR UPDATE',
        )
      ).rows[0]!;
      if (
        before.password_ciphertext &&
        !dto.password &&
        (before.smtp_host.toLowerCase() !== dto.smtpHost.toLowerCase() ||
          before.smtp_username !== dto.smtpUsername.trim())
      )
        throw new BadRequestException(
          'Enter the new provider password when changing SMTP host or username.',
        );
      const password = dto.password
        ? protectMailSecret(dto.password)
        : before.password_ciphertext;
      if (
        dto.enabled &&
        (!config.MAIL_CONFIG_KEY || !password || !dto.smtpUsername.trim())
      )
        throw new BadRequestException(
          'Save SMTP credentials and configure the encryption key before enabling mail.',
        );
      const changed =
        before.ticket_address !== dto.ticketAddress.toLowerCase() ||
        before.change_address !== dto.changeAddress.toLowerCase() ||
        before.inbound_provider !== dto.inboundProvider;
      await db.query(
        `UPDATE mail_settings SET enabled=$1,smtp_host=$2,smtp_port=$3,tls_mode=$4,smtp_username=$5,password_ciphertext=$6,
        ticket_address=$7,change_address=$8,inbound_provider=$9,inbound_since=CASE WHEN $10 THEN now() ELSE inbound_since END,updated_at=now() WHERE id=1`,
        [
          dto.enabled,
          dto.smtpHost,
          dto.smtpPort,
          dto.tlsMode,
          dto.smtpUsername.trim(),
          password,
          dto.ticketAddress.toLowerCase(),
          dto.changeAddress.toLowerCase(),
          dto.inboundProvider,
          changed,
        ],
      );
      // Never send queued content from a different mailbox after a configuration change.
      if (changed) {
        await db.query(
          'UPDATE mail_sync_state SET cursor=NULL,last_sync_at=NULL,last_error_code=NULL WHERE mailbox=ANY($1::text[])',
          [[dto.ticketAddress.toLowerCase(), dto.changeAddress.toLowerCase()]],
        );
        await db.query(
          "UPDATE mail_messages SET state='FAILED',last_error_code='MAILBOX_CHANGED' WHERE state='QUEUED'",
        );
      }
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,details) VALUES($1,'EMAIL.SETTINGS_UPDATED','EMAIL_SETTINGS',$2::jsonb)",
        [
          user.id,
          JSON.stringify({
            enabled: dto.enabled,
            smtpHost: dto.smtpHost,
            smtpPort: dto.smtpPort,
            tlsMode: dto.tlsMode,
            ticketAddress: dto.ticketAddress,
            changeAddress: dto.changeAddress,
            inboundProvider: dto.inboundProvider,
            credentialsChanged:
              Boolean(dto.password) ||
              before.smtp_username !== dto.smtpUsername,
          }),
        ],
      );
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
    return { saved: true };
  }
  async verify(user: AuthenticatedUser) {
    this.admin(user);
    const transport = smtpTransport(await loadMailSettings(this.dependencies));
    try {
      await transport.verify();
      return {
        connected: true,
        message:
          'SMTP connection and authentication succeeded. This does not verify sender permission or final delivery.',
      };
    } catch {
      throw new BadRequestException(
        'SMTP connection or authentication failed. Check the saved settings and outbound firewall rules.',
      );
    } finally {
      transport.close();
    }
  }
  async test(user: AuthenticatedUser, dto: MailTestDto) {
    this.admin(user);
    if (dto.channel !== 'TICKET')
      throw new BadRequestException('CAB email is disabled.');
    const settings = await loadMailSettings(this.dependencies);
    if (!settings.enabled)
      throw new BadRequestException('Enable email before sending a test.');
    const existing = await this.dependencies.db.query(
      "SELECT 1 FROM mail_messages WHERE channel='TEST' AND created_by_user_id=$1 AND created_at>now()-interval '1 minute'",
      [user.id],
    );
    if (existing.rowCount)
      throw new BadRequestException(
        'Wait one minute before sending another test.',
      );
    const mailbox = settings.ticket_address;
    const result = await this.dependencies.db.query(
      `INSERT INTO mail_messages(direction,channel,mailbox,message_id,sender_address,recipient_addresses,subject,body,state,created_by_user_id)
      VALUES('OUTBOUND','TEST',$1,$2,$1,$3,'Amnikon email configuration test','This is the test email you requested from Amnikon Service Desk.','QUEUED',$4) RETURNING id`,
      [
        mailbox,
        `<${randomBytes(24).toString('hex')}@${mailbox.split('@')[1]}>`,
        [user.email],
        user.id,
      ],
    );
    await this.dependencies.db.query(
      "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'EMAIL.TEST_REQUESTED','EMAIL',$2,'{}')",
      [user.id, result.rows[0].id],
    );
    return { queued: true, recipient: user.email };
  }
  async status(user: AuthenticatedUser) {
    this.admin(user);
    const [messages, sync] = await Promise.all([
      this.dependencies.db.query(
        'SELECT id,direction,channel,ticket_id,change_id,mailbox,subject,state,attempts,last_error_code,created_at,processed_at FROM mail_messages ORDER BY created_at DESC LIMIT 100',
      ),
      this.dependencies.db.query(
        'SELECT mailbox,last_sync_at,last_error_code FROM mail_sync_state',
      ),
    ]);
    return { messages: messages.rows, sync: sync.rows };
  }
}
@Controller('admin/email')
export class MailSettingsController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: MailSettingsService,
  ) {}
  @Get() async settings(@Req() r: FastifyRequest) {
    return this.service.settings(await this.auth.currentUser(r));
  }
  @Patch() async save(
    @Req() r: FastifyRequest,
    @Body() b: SaveMailSettingsDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.save(await this.auth.currentUser(r), b);
  }
  @Post('verify') async verify(@Req() r: FastifyRequest) {
    await this.auth.verifyCsrf(r);
    return this.service.verify(await this.auth.currentUser(r));
  }
  @Post('test') async test(@Req() r: FastifyRequest, @Body() b: MailTestDto) {
    await this.auth.verifyCsrf(r);
    return this.service.test(await this.auth.currentUser(r), b);
  }
  @Get('status') async status(@Req() r: FastifyRequest) {
    return this.service.status(await this.auth.currentUser(r));
  }
}
