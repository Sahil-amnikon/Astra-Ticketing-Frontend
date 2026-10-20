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
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
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
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { AuthService, type AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';
import { loadMailSettings } from './mail-settings';
import {
  changeTransaction,
  governedDecision,
  governedStatus,
  lockedChange,
  recordChangeEvent,
} from './change-governance-rules';
import { queueChangeEmail } from './mail-queue';

const CHANGE_TYPES = ['STANDARD', 'NORMAL', 'EMERGENCY'] as const;
const RISKS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const CATEGORIES = [
  'SERVER',
  'CLOUD',
  'MICROSOFT_365',
  'NETWORK',
  'SECURITY',
  'APPLICATION',
  'OTHER',
] as const;
const STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'ASSESSMENT',
  'AWAITING_APPROVAL',
  'APPROVED',
  'SCHEDULED',
  'IN_PROGRESS',
  'VALIDATION',
  'COMPLETED',
  'CLOSED',
  'REJECTED',
  'CANCELLED',
  'FAILED',
  'ROLLED_BACK',
] as const;
const INTERNAL_CLIENT_ID = '00000000-0000-4000-8000-000000000132';
const STAKEHOLDER_ROLES = [
  'STAKEHOLDER',
  'BUSINESS_CONTACT',
  'TECHNICAL_CONTACT',
  'OBSERVER',
] as const;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/gif',
  'image/jpeg',
  'image/png',
  'text/csv',
  'text/plain',
]);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export class ChangeAttachmentDto {
  @IsString() @MinLength(1) @MaxLength(255) fileName!: string;
  @IsString() @MaxLength(200) contentType!: string;
  @IsString() @MinLength(1) contentBase64!: string;
}

export class ChangeExternalStakeholderDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsOptional() @IsIn(STAKEHOLDER_ROLES) role = 'STAKEHOLDER';
}

export class CreateChangeContactDto {
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsEmail() @MaxLength(320) email!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
}

export class ChangeQuery {
  @IsOptional() @IsString() @MaxLength(200) q = '';
  @IsOptional() @IsIn(STATUSES) status?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
export class CreateChangeDto {
  @IsUUID() clientId!: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(3) @MaxLength(10000) description!: string;
  @IsIn(CATEGORIES) category!: string;
  @IsIn(CHANGE_TYPES) changeType!: string;
  @IsIn(RISKS) risk!: string;
  @IsString() @MinLength(2) @MaxLength(5000) impact!: string;
  @IsBoolean() outageExpected = false;
  @IsInt() @Min(0) @Max(525600) downtimeMinutes = 0;
  @IsString() @MinLength(2) @MaxLength(5000) reason!: string;
  @IsString() @MinLength(2) @MaxLength(5000) businessJustification!: string;
  @IsString() @MinLength(2) @MaxLength(10000) implementationPlan!: string;
  @IsString() @MinLength(2) @MaxLength(10000) testPlan!: string;
  @IsString() @MinLength(2) @MaxLength(10000) rollbackPlan!: string;
  @IsOptional() @IsString() @MaxLength(10000) communicationPlan = '';
  @IsBoolean() clientNotificationEnabled = false;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @IsString() plannedStart?: string;
  @IsOptional() @IsString() plannedEnd?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  stakeholderContactIds: string[] = [];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ChangeExternalStakeholderDto)
  externalStakeholders: ChangeExternalStakeholderDto[] = [];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ChangeAttachmentDto)
  attachments: ChangeAttachmentDto[] = [];
}
export class ChangeStatusDto {
  @IsIn(STATUSES) status!: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  overrideReason?: string;
}
export class ChangeTaskDto {
  @IsString() @MinLength(2) @MaxLength(300) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) instructions = '';
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() assignedUserId?: string;
  @IsOptional() @IsString() dueAt?: string;
}
export class ChangeTaskUpdateDto {
  @IsIn(['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'WAIVED'])
  status!: string;
  @IsOptional() @IsString() @MaxLength(2000) updateNote?: string;
}
export class ChangeApprovalDto {
  @IsOptional() @IsUUID() approverUserId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsInt() @Min(1) @Max(100) sequence = 1;
  @IsBoolean() required = true;
}
export class ChangeDecisionDto {
  @IsIn(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']) status!: string;
  @IsString() @MinLength(2) @MaxLength(3000) note!: string;
}
export class ChangeUpdateDto {
  @IsIn(['INTERNAL', 'IMPLEMENTATION', 'VALIDATION', 'CLIENT_COMMUNICATION'])
  updateType!: string;
  @IsString() @MinLength(2) @MaxLength(10000) body!: string;
}
export class ChangeTeamDto {
  @IsUUID() departmentId!: string;
  @IsIn(['LEAD', 'IMPLEMENTER', 'REVIEWER']) role!: string;
}
export class ChangeTicketLinkDto {
  @IsUUID() ticketId!: string;
}
export class ChangeCommunicationDto {
  @IsArray() @IsEmail({}, { each: true }) recipientEmails!: string[];
  @IsString() @MinLength(2) @MaxLength(300) subject!: string;
  @IsString() @MinLength(2) @MaxLength(20000) body!: string;
  @IsBoolean() includeClient = false;
}
export class ChangeStakeholderDto {
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsString() @MaxLength(200) externalName?: string;
  @IsOptional() @IsEmail() @MaxLength(320) externalEmail?: string;
  @IsOptional() @IsIn(STAKEHOLDER_ROLES) role = 'STAKEHOLDER';
}

@Injectable()
export class ChangeService {
  constructor(private readonly dependencies: Dependencies) {}

  private requireAccess(user: AuthenticatedUser) {
    if (
      (user.changeAccess ?? 'NONE') === 'NONE' &&
      !user.roles.includes('ADMIN')
    )
      throw new ForbiddenException('Change Management access is not enabled');
  }
  private coordinator(user: AuthenticatedUser) {
    return (
      user.roles.includes('ADMIN') ||
      ['COORDINATOR', 'CHANGE_MANAGER'].includes(user.changeAccess ?? '')
    );
  }
  private async history(
    db: Pick<PoolClient, 'query'>,
    changeId: string,
    actorId: string,
    event: string,
    details: object = {},
  ) {
    await db.query(
      'INSERT INTO change_history(change_id,actor_user_id,event,details) VALUES($1,$2,$3,$4::jsonb)',
      [changeId, actorId, event, JSON.stringify(details)],
    );
    await db.query(
      "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'CHANGE',$3,$4::jsonb)",
      [actorId, event, changeId, JSON.stringify(details)],
    );
  }
  private attachmentContent(dto: ChangeAttachmentDto) {
    if (!ALLOWED_ATTACHMENT_TYPES.has(dto.contentType))
      throw new BadRequestException('This file type is not allowed');
    if (
      dto.fileName.includes('/') ||
      dto.fileName.includes('\\') ||
      dto.fileName.includes('\0')
    )
      throw new BadRequestException('Invalid file name');
    const content = Buffer.from(dto.contentBase64, 'base64');
    if (!content.length || content.length > MAX_ATTACHMENT_BYTES)
      throw new BadRequestException(
        'Attachments must be between 1 byte and 5 MB',
      );
    if (
      content.toString('base64').replace(/=+$/, '') !==
      dto.contentBase64.replace(/\s|=+$/g, '')
    )
      throw new BadRequestException('Invalid attachment data');
    return content;
  }
  private async insertAttachment(
    db: Pick<PoolClient, 'query'>,
    changeId: string,
    dto: ChangeAttachmentDto,
    actorId: string,
  ) {
    const content = this.attachmentContent(dto);
    const id = randomUUID();
    const sha256 = createHash('sha256').update(content).digest('hex');
    await db.query(
      `INSERT INTO change_attachments(id,change_id,uploaded_by_user_id,file_name,content_type,size_bytes,sha256,content)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        id,
        changeId,
        actorId,
        dto.fileName.trim(),
        dto.contentType,
        content.length,
        sha256,
        content,
      ],
    );
    return { id, fileName: dto.fileName.trim(), sizeBytes: content.length };
  }
  private async insertStakeholder(
    db: Pick<PoolClient, 'query'>,
    changeId: string,
    actorId: string,
    stakeholder: ChangeStakeholderDto,
  ) {
    if (!stakeholder.contactId && !stakeholder.externalEmail)
      throw new BadRequestException(
        'Select a client contact or enter an external email',
      );
    if (stakeholder.contactId && stakeholder.externalEmail)
      throw new BadRequestException(
        'A stakeholder must be either a client contact or an external email',
      );
    const result = await db.query(
      `INSERT INTO change_stakeholders(change_id,contact_id,external_name,external_email,stakeholder_role,added_by_user_id)
       SELECT $1::uuid,ct.id,NULL::text,NULL::text,$4::text,$5::uuid FROM contacts ct JOIN changes ch ON ch.id=$1 AND ch.client_id=ct.client_id WHERE ct.id=$2 AND ct.active AND (ct.site_id IS NULL OR ct.site_id IS NOT DISTINCT FROM ch.site_id) AND NOT EXISTS(SELECT 1 FROM users iu JOIN user_roles ur ON ur.user_id=iu.id WHERE (iu.id=ct.user_id OR lower(iu.email)=lower(ct.email)) AND ur.role_code IN ('INTERN','TECHNICIAN','TEAM_LEAD','MANAGER','ADMIN'))
       UNION ALL
       SELECT $1::uuid,NULL::uuid,$6::text,lower($3),$4::text,$5::uuid WHERE $2::uuid IS NULL AND $3::text IS NOT NULL
       ON CONFLICT DO NOTHING RETURNING id`,
      [
        changeId,
        stakeholder.contactId ?? null,
        stakeholder.externalEmail?.trim().toLowerCase() || null,
        stakeholder.role ?? 'STAKEHOLDER',
        actorId,
        stakeholder.externalName?.trim() || null,
      ],
    );
    if (!result.rowCount)
      throw new BadRequestException(
        'Stakeholder is inactive, belongs to another organization, or is already added',
      );
    return result.rows[0] as { id: string };
  }
  private scopeSql(user: AuthenticatedUser, alias = 'c') {
    if (user.roles.includes('ADMIN'))
      return { sql: 'true', values: [] as unknown[] };
    return {
      sql: `(${alias}.client_id=ANY($1::uuid[]) AND ($4::boolean OR ${alias}.requested_by_user_id=$2 OR ${alias}.owner_user_id=$2 OR EXISTS(SELECT 1 FROM change_tasks ct WHERE ct.change_id=${alias}.id AND ct.assigned_user_id=$2) OR EXISTS(SELECT 1 FROM change_approvals ca WHERE ca.change_id=${alias}.id AND (ca.approver_user_id=$2 OR ca.department_id=ANY($3::uuid[]))) OR EXISTS(SELECT 1 FROM change_teams tm WHERE tm.change_id=${alias}.id AND tm.department_id=ANY($3::uuid[]))))`,
      values: [
        user.clientIds,
        user.id,
        user.departmentIds ?? [],
        user.changeAccess === 'CHANGE_MANAGER',
      ],
    };
  }
  async assertVisible(
    id: string,
    user: AuthenticatedUser,
    db = this.dependencies.db,
  ) {
    this.requireAccess(user);
    const scope = this.scopeSql(user);
    const result = await db.query(
      `SELECT c.* FROM changes c WHERE c.id=$${scope.values.length + 1} AND ${scope.sql}`,
      [...scope.values, id],
    );
    if (!result.rows[0]) throw new NotFoundException();
    return result.rows[0] as Record<string, unknown>;
  }
  async options(user: AuthenticatedUser) {
    this.requireAccess(user);
    const [clients, sites, contacts, departments, users, tickets] =
      await Promise.all([
        this.dependencies.db.query(
          "SELECT id,name,organization_type FROM clients WHERE status='ACTIVE' AND ($1::boolean OR id=ANY($2::uuid[])) ORDER BY name",
          [user.roles.includes('ADMIN'), user.clientIds],
        ),
        this.dependencies.db.query(
          'SELECT id,client_id,name FROM sites WHERE active AND ($1::boolean OR client_id=ANY($2::uuid[])) ORDER BY name',
          [user.roles.includes('ADMIN'), user.clientIds],
        ),
        this.dependencies.db.query(
          `SELECT ct.id,ct.client_id,ct.site_id,ct.name,ct.email
             FROM contacts ct
            WHERE ct.active
              AND ($1::boolean OR ct.client_id=ANY($2::uuid[]))
              AND NOT EXISTS(
                SELECT 1 FROM users iu
                  JOIN user_roles ur ON ur.user_id=iu.id
                 WHERE (iu.id=ct.user_id OR lower(iu.email)=lower(ct.email))
                   AND ur.role_code IN ('INTERN','TECHNICIAN','TEAM_LEAD','MANAGER','ADMIN')
              )
            ORDER BY ct.name,ct.email`,
          [user.roles.includes('ADMIN'), user.clientIds],
        ),
        this.dependencies.db.query(
          'SELECT id,name,description FROM departments WHERE active ORDER BY name',
        ),
        this.dependencies.db.query(
          "SELECT u.id,u.display_name AS name,string_agg(DISTINCT d.name,', ') AS departments,string_agg(DISTINCT du.expertise,'; ') AS expertise FROM users u LEFT JOIN department_users du ON du.user_id=u.id LEFT JOIN departments d ON d.id=du.department_id WHERE u.active AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role_code IN ('INTERN','TECHNICIAN','TEAM_LEAD','MANAGER','ADMIN')) GROUP BY u.id ORDER BY u.display_name",
        ),
        this.dependencies.db.query(
          'SELECT id,ticket_number,subject,client_id FROM tickets WHERE $1::boolean OR client_id=ANY($2::uuid[]) ORDER BY created_at DESC LIMIT 200',
          [user.roles.includes('ADMIN'), user.clientIds],
        ),
      ]);
    const mail = await loadMailSettings(this.dependencies);
    return {
      clients: clients.rows,
      sites: sites.rows,
      contacts: contacts.rows,
      departments: departments.rows,
      users: users.rows,
      tickets: tickets.rows,
      categories: CATEGORIES,
      types: CHANGE_TYPES,
      risks: RISKS,
      statuses: STATUSES,
      internalClientId: INTERNAL_CLIENT_ID,
      emailEnabled: mail.enabled,
      changeMailbox: mail.change_address,
    };
  }

  async createContact(user: AuthenticatedUser, dto: CreateChangeContactDto) {
    this.requireAccess(user);
    if (!user.roles.includes('ADMIN') && !user.clientIds.includes(dto.clientId))
      throw new ForbiddenException();
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      if (dto.siteId) {
        const site = await db.query(
          'SELECT 1 FROM sites WHERE id=$1 AND client_id=$2 AND active',
          [dto.siteId, dto.clientId],
        );
        if (!site.rowCount)
          throw new BadRequestException(
            'Site does not belong to the selected organization',
          );
      }
      const duplicate = await db.query(
        'SELECT 1 FROM contacts WHERE client_id=$1 AND lower(email)=lower($2) AND active',
        [dto.clientId, dto.email.trim()],
      );
      if (duplicate.rowCount)
        throw new BadRequestException(
          'An active contact with this email already exists for the organization',
        );
      const inserted = await db.query(
        `INSERT INTO contacts(client_id,site_id,name,email,phone)
         VALUES($1,$2,$3,lower($4),$5)
         RETURNING id,client_id,site_id,name,email`,
        [
          dto.clientId,
          dto.siteId ?? null,
          dto.name.trim(),
          dto.email.trim(),
          dto.phone?.trim() || null,
        ],
      );
      const contact = inserted.rows[0];
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'CONTACT.CREATED','CONTACT',$2,$3::jsonb)",
        [
          user.id,
          contact.id,
          JSON.stringify({
            clientId: dto.clientId,
            siteId: dto.siteId ?? null,
            source: 'CHANGE_INTAKE',
          }),
        ],
      );
      await db.query('COMMIT');
      return contact;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  async list(user: AuthenticatedUser, q: ChangeQuery) {
    this.requireAccess(user);
    const scope = this.scopeSql(user);
    const offset = scope.values.length;
    const result = await this.dependencies.db.query(
      `WITH filtered AS (SELECT c.*,cl.name AS client_name,u.display_name AS owner_name FROM changes c JOIN clients cl ON cl.id=c.client_id JOIN users u ON u.id=c.owner_user_id WHERE ${scope.sql} AND ($${offset + 1}='' OR c.change_number ILIKE $${offset + 2} OR c.title ILIKE $${offset + 2}) AND ($${offset + 3}::text IS NULL OR c.status=$${offset + 3}) AND ($${offset + 4}::uuid IS NULL OR c.client_id=$${offset + 4})) SELECT (SELECT count(*)::int FROM filtered) total,COALESCE((SELECT jsonb_agg(x) FROM (SELECT * FROM filtered ORDER BY updated_at DESC LIMIT $${offset + 5} OFFSET $${offset + 6}) x),'[]') items`,
      [
        ...scope.values,
        q.q,
        `%${q.q.replace(/[\\%_]/g, '\\$&')}%`,
        q.status ?? null,
        q.clientId ?? null,
        q.pageSize,
        (q.page - 1) * q.pageSize,
      ],
    );
    return { ...result.rows[0], page: q.page, pageSize: q.pageSize };
  }
  async dashboard(user: AuthenticatedUser) {
    this.requireAccess(user);
    const scope = this.scopeSql(user);
    const result = await this.dependencies.db.query(
      `SELECT count(*)::int total,count(*) FILTER(WHERE status IN ('SUBMITTED','ASSESSMENT','AWAITING_APPROVAL'))::int awaiting_approval,count(*) FILTER(WHERE status IN ('APPROVED','SCHEDULED'))::int scheduled,count(*) FILTER(WHERE status='IN_PROGRESS')::int in_progress,count(*) FILTER(WHERE risk IN ('HIGH','CRITICAL') AND status NOT IN ('CLOSED','CANCELLED'))::int high_risk FROM changes c WHERE ${scope.sql}`,
      scope.values,
    );
    return result.rows[0];
  }
  async detail(id: string, user: AuthenticatedUser) {
    const change = await this.assertVisible(id, user);
    const [
      teams,
      tasks,
      approvals,
      updates,
      links,
      history,
      communications,
      stakeholders,
      attachments,
    ] = await Promise.all([
      this.dependencies.db.query(
        'SELECT ct.*,d.name AS department_name FROM change_teams ct JOIN departments d ON d.id=ct.department_id WHERE change_id=$1 ORDER BY d.name',
        [id],
      ),
      this.dependencies.db.query(
        'SELECT ct.*,d.name AS department_name,u.display_name AS assigned_name FROM change_tasks ct LEFT JOIN departments d ON d.id=ct.department_id LEFT JOIN users u ON u.id=ct.assigned_user_id WHERE change_id=$1 ORDER BY ct.created_at',
        [id],
      ),
      this.dependencies.db.query(
        'SELECT ca.*,u.display_name AS approver_name,d.name AS department_name,du.display_name AS decision_by_name FROM change_approvals ca LEFT JOIN users u ON u.id=ca.approver_user_id LEFT JOIN departments d ON d.id=ca.department_id LEFT JOIN users du ON du.id=ca.decision_by_user_id WHERE change_id=$1 ORDER BY sequence,created_at',
        [id],
      ),
      this.dependencies.db.query(
        'SELECT cu.*,u.display_name AS author_name FROM change_updates cu LEFT JOIN users u ON u.id=cu.author_user_id WHERE change_id=$1 ORDER BY created_at DESC',
        [id],
      ),
      this.dependencies.db.query(
        'SELECT l.*,t.ticket_number,t.subject FROM change_ticket_links l JOIN tickets t ON t.id=l.ticket_id WHERE change_id=$1',
        [id],
      ),
      this.dependencies.db.query(
        'SELECT h.*,u.display_name AS actor_name FROM change_history h LEFT JOIN users u ON u.id=h.actor_user_id WHERE change_id=$1 ORDER BY h.id DESC',
        [id],
      ),
      this.dependencies.db.query(
        'SELECT id,recipient_emails,subject,include_client,status,attempts,last_error_code,sent_at,created_at FROM change_communications WHERE change_id=$1 ORDER BY created_at DESC',
        [id],
      ),
      this.dependencies.db.query(
        `SELECT cs.id,cs.contact_id,cs.external_name,cs.external_email,cs.stakeholder_role,cs.created_at,ct.name AS contact_name,ct.email AS contact_email,u.display_name AS legacy_user_name,u.email AS legacy_user_email
           FROM change_stakeholders cs LEFT JOIN contacts ct ON ct.id=cs.contact_id LEFT JOIN users u ON u.id=cs.user_id
           WHERE cs.change_id=$1 ORDER BY COALESCE(ct.name,u.display_name,cs.external_name,cs.external_email)`,
        [id],
      ),
      this.dependencies.db.query(
        `SELECT a.id,a.file_name,a.content_type,a.size_bytes,a.created_at,u.display_name AS uploaded_by
           FROM change_attachments a LEFT JOIN users u ON u.id=a.uploaded_by_user_id
           WHERE a.change_id=$1 ORDER BY a.created_at DESC`,
        [id],
      ),
    ]);
    return {
      change,
      teams: teams.rows,
      tasks: tasks.rows,
      approvals: approvals.rows,
      updates: updates.rows,
      links: links.rows,
      history: history.rows,
      communications: communications.rows,
      stakeholders: stakeholders.rows,
      attachments: attachments.rows,
    };
  }
  async create(user: AuthenticatedUser, dto: CreateChangeDto) {
    this.requireAccess(user);
    if (!user.roles.includes('ADMIN') && !user.clientIds.includes(dto.clientId))
      throw new ForbiddenException();
    if (dto.siteId) {
      const site = await this.dependencies.db.query(
        'SELECT 1 FROM sites WHERE id=$1 AND client_id=$2 AND active',
        [dto.siteId, dto.clientId],
      );
      if (!site.rowCount)
        throw new BadRequestException(
          'Site does not belong to the selected organization',
        );
    }
    const db = await this.dependencies.db.connect();
    try {
      await db.query('BEGIN');
      const result = await db.query(
        `INSERT INTO changes(client_id,site_id,department_id,title,description,category,change_type,risk,impact,outage_expected,downtime_minutes,reason,business_justification,implementation_plan,test_plan,rollback_plan,communication_plan,client_notification_enabled,owner_user_id,requested_by_user_id,planned_start,planned_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22) RETURNING id,change_number`,
        [
          dto.clientId,
          dto.siteId ?? null,
          dto.departmentId ?? null,
          dto.title.trim(),
          dto.description.trim(),
          dto.category,
          dto.changeType,
          dto.risk,
          dto.impact.trim(),
          dto.outageExpected,
          dto.downtimeMinutes,
          dto.reason.trim(),
          dto.businessJustification.trim(),
          dto.implementationPlan.trim(),
          dto.testPlan.trim(),
          dto.rollbackPlan.trim(),
          dto.communicationPlan.trim(),
          dto.clientNotificationEnabled,
          dto.ownerUserId ?? user.id,
          user.id,
          dto.plannedStart || null,
          dto.plannedEnd || null,
        ],
      );
      const row = result.rows[0];
      for (const stakeholderId of new Set(dto.stakeholderContactIds ?? []))
        await this.insertStakeholder(db, row.id, user.id, {
          contactId: stakeholderId,
          role: 'STAKEHOLDER',
        });
      for (const stakeholder of dto.externalStakeholders ?? [])
        await this.insertStakeholder(db, row.id, user.id, {
          externalName: stakeholder.name,
          externalEmail: stakeholder.email,
          role: stakeholder.role,
        });
      const files = [];
      for (const attachment of dto.attachments ?? [])
        files.push(
          await this.insertAttachment(db, row.id, attachment, user.id),
        );
      await this.history(db, row.id, user.id, 'CHANGE.CREATED', {
        changeNumber: row.change_number,
        stakeholderCount:
          (dto.stakeholderContactIds?.length ?? 0) +
          (dto.externalStakeholders?.length ?? 0),
        attachmentCount: files.length,
      });
      await db.query('COMMIT');
      return row;
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  }
  async status(id: string, user: AuthenticatedUser, dto: ChangeStatusDto) {
    await this.assertVisible(id, user);
    return governedStatus(this.dependencies, id, user, dto);
  }
  async addTeam(id: string, user: AuthenticatedUser, dto: ChangeTeamDto) {
    await this.assertVisible(id, user);
    if (!this.coordinator(user)) throw new ForbiddenException();
    await this.dependencies.db.query(
      "INSERT INTO change_teams(change_id,department_id,role,status) VALUES($1,$2,$3,'ACTIVE') ON CONFLICT(change_id,department_id) DO UPDATE SET role=excluded.role,status='ACTIVE'",
      [id, dto.departmentId, dto.role],
    );
    await this.history(
      this.dependencies.db,
      id,
      user.id,
      'CHANGE.TEAM_ADDED',
      dto,
    );
    return { id };
  }
  async addTask(id: string, user: AuthenticatedUser, dto: ChangeTaskDto) {
    const change = await this.assertVisible(id, user);
    if (!this.coordinator(user)) throw new ForbiddenException();
    const r = await this.dependencies.db.query(
      'INSERT INTO change_tasks(change_id,department_id,assigned_user_id,title,instructions,due_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
      [
        id,
        dto.departmentId ?? null,
        dto.assignedUserId ?? null,
        dto.title.trim(),
        dto.instructions.trim(),
        dto.dueAt || null,
      ],
    );
    if (dto.assignedUserId)
      await this.dependencies.db.query(
        `INSERT INTO notifications(user_id,change_id,type,title,body,event_key) VALUES($1,$2,'CHANGE_TASK_ASSIGNED',$3,$4,$5) ON CONFLICT(event_key) DO NOTHING`,
        [
          dto.assignedUserId,
          id,
          `Task assigned on ${String(change.change_number)}`,
          dto.title.trim(),
          `change-task:${r.rows[0].id}`,
        ],
      );
    await this.history(this.dependencies.db, id, user.id, 'CHANGE.TASK_ADDED', {
      taskId: r.rows[0].id,
      title: dto.title,
    });
    return r.rows[0];
  }
  async updateTask(
    id: string,
    taskId: string,
    user: AuthenticatedUser,
    dto: ChangeTaskUpdateDto,
  ) {
    await this.assertVisible(id, user);
    if (
      dto.status === 'WAIVED' &&
      (!this.coordinator(user) || (dto.updateNote?.trim().length ?? 0) < 10)
    )
      throw new BadRequestException(
        'Only a coordinator can waive a task, with a reason of at least 10 characters.',
      );
    return changeTransaction(this.dependencies, async (db) => {
      const change = await lockedChange(db, id);
      if (
        ['COMPLETED', 'CLOSED', 'FAILED', 'ROLLED_BACK', 'CANCELLED'].includes(
          String(change.status),
        )
      )
        throw new BadRequestException(
          'Tasks cannot be changed after implementation has ended.',
        );
      const allowed = await db.query(
        'SELECT 1 FROM change_tasks WHERE id=$1 AND change_id=$2 AND (assigned_user_id=$3 OR $4::boolean)',
        [taskId, id, user.id, this.coordinator(user)],
      );
      if (!allowed.rowCount) throw new ForbiddenException();
      await db.query(
        "UPDATE change_tasks SET status=$3,update_note=$4,completed_at=CASE WHEN $3='COMPLETED' THEN now() ELSE NULL END WHERE id=$1 AND change_id=$2",
        [taskId, id, dto.status, dto.updateNote ?? null],
      );
      await this.history(db, id, user.id, 'CHANGE.TASK_UPDATED', {
        taskId,
        status: dto.status,
        note: dto.updateNote,
      });
      return { id: taskId };
    });
  }
  async addApproval(
    id: string,
    user: AuthenticatedUser,
    dto: ChangeApprovalDto,
  ) {
    await this.assertVisible(id, user);
    if (!this.coordinator(user)) throw new ForbiddenException();
    if (
      (!dto.approverUserId && !dto.departmentId) ||
      (dto.approverUserId && dto.departmentId)
    )
      throw new BadRequestException('Select an approver or department');
    return changeTransaction(this.dependencies, async (db) => {
      const change = await lockedChange(db, id);
      if (!['DRAFT', 'SUBMITTED', 'ASSESSMENT'].includes(String(change.status)))
        throw new BadRequestException(
          'Add reviewers during assessment, before requesting approval.',
        );
      const eligible = await db.query(
        `SELECT u.id FROM users u WHERE u.active AND u.id<>$3 AND u.id<>$4
      AND (u.id=$1 OR EXISTS(SELECT 1 FROM department_users du WHERE du.user_id=u.id AND du.department_id=$2))
      AND (EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_code='ADMIN')
        OR (u.change_access<>'NONE' AND EXISTS(SELECT 1 FROM client_users cu WHERE cu.user_id=u.id AND cu.client_id=$5)))`,
        [
          dto.approverUserId ?? null,
          dto.departmentId ?? null,
          change.requested_by_user_id,
          change.owner_user_id,
          change.client_id,
        ],
      );
      if (!eligible.rowCount)
        throw new BadRequestException(
          'Choose an independent active reviewer with Change Management access to this client.',
        );
      const r = await db.query(
        'INSERT INTO change_approvals(change_id,approver_user_id,department_id,sequence,required,revision) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [
          id,
          dto.approverUserId ?? null,
          dto.departmentId ?? null,
          dto.sequence,
          dto.required,
          change.revision,
        ],
      );
      await db.query(
        `INSERT INTO notifications(user_id,change_id,type,title,body,event_key) SELECT u.id,$1,'CHANGE_APPROVAL_REQUESTED',$2,$3,$4||':'||u.id::text FROM users u WHERE u.id=ANY($5::uuid[]) ON CONFLICT(event_key) DO NOTHING`,
        [
          id,
          `Approval requested for ${String(change.change_number)}`,
          String(change.title),
          `change-approval:${r.rows[0].id}`,
          eligible.rows.map((row) => row.id),
        ],
      );
      await recordChangeEvent(db, id, user.id, 'CHANGE.APPROVAL_ADDED', {
        approvalId: r.rows[0].id,
        revision: change.revision,
      });
      return r.rows[0];
    });
  }
  async decide(
    id: string,
    approvalId: string,
    user: AuthenticatedUser,
    dto: ChangeDecisionDto,
  ) {
    await this.assertVisible(id, user);
    return governedDecision(this.dependencies, id, approvalId, user, dto);
  }
  async addUpdate(id: string, user: AuthenticatedUser, dto: ChangeUpdateDto) {
    await this.assertVisible(id, user);
    const r = await this.dependencies.db.query(
      'INSERT INTO change_updates(change_id,author_user_id,update_type,body) VALUES($1,$2,$3,$4) RETURNING id',
      [id, user.id, dto.updateType, dto.body.trim()],
    );
    await this.history(
      this.dependencies.db,
      id,
      user.id,
      'CHANGE.UPDATE_ADDED',
      { updateId: r.rows[0].id, type: dto.updateType },
    );
    return r.rows[0];
  }
  async linkTicket(
    id: string,
    user: AuthenticatedUser,
    dto: ChangeTicketLinkDto,
  ) {
    const change = await this.assertVisible(id, user);
    if (!this.coordinator(user)) throw new ForbiddenException();
    const r = await this.dependencies.db.query(
      'INSERT INTO change_ticket_links(change_id,ticket_id,linked_by_user_id) SELECT $1,t.id,$3 FROM tickets t WHERE t.id=$2 AND t.client_id=$4 ON CONFLICT DO NOTHING RETURNING ticket_id',
      [id, dto.ticketId, user.id, change.client_id],
    );
    if (!r.rowCount)
      throw new BadRequestException(
        'Ticket must belong to the same organization',
      );
    await this.history(
      this.dependencies.db,
      id,
      user.id,
      'CHANGE.TICKET_LINKED',
      { ticketId: dto.ticketId },
    );
    return { id };
  }
  async addStakeholder(
    id: string,
    user: AuthenticatedUser,
    dto: ChangeStakeholderDto,
  ) {
    await this.assertVisible(id, user);
    if (!this.coordinator(user)) throw new ForbiddenException();
    const stakeholder = await this.insertStakeholder(
      this.dependencies.db,
      id,
      user.id,
      dto,
    );
    await this.history(
      this.dependencies.db,
      id,
      user.id,
      'CHANGE.STAKEHOLDER_ADDED',
      {
        stakeholderId: stakeholder.id,
        contactId: dto.contactId,
        externalEmail: dto.externalEmail,
        role: dto.role,
      },
    );
    return stakeholder;
  }
  async addAttachment(
    id: string,
    user: AuthenticatedUser,
    dto: ChangeAttachmentDto,
  ) {
    await this.assertVisible(id, user);
    const file = await this.insertAttachment(
      this.dependencies.db,
      id,
      dto,
      user.id,
    );
    await this.history(
      this.dependencies.db,
      id,
      user.id,
      'CHANGE.ATTACHMENT_ADDED',
      file,
    );
    return { id: file.id };
  }
  async attachment(id: string, attachmentId: string, user: AuthenticatedUser) {
    await this.assertVisible(id, user);
    const result = await this.dependencies.db.query<{
      file_name: string;
      content_type: string;
      content: Buffer;
    }>(
      'SELECT file_name,content_type,content FROM change_attachments WHERE id=$1 AND change_id=$2',
      [attachmentId, id],
    );
    if (!result.rows[0]) throw new NotFoundException();
    return result.rows[0];
  }
  async communication(
    id: string,
    user: AuthenticatedUser,
    dto: ChangeCommunicationDto,
  ) {
    await this.assertVisible(id, user);
    if (!this.coordinator(user)) throw new ForbiddenException();
    const r = await this.dependencies.db.query(
      "INSERT INTO change_communications(change_id,recipient_emails,subject,body,include_client,status,created_by_user_id) VALUES($1,$2,$3,$4,$5,'DRAFT',$6) RETURNING id,status",
      [
        id,
        [...new Set(dto.recipientEmails.map((x) => x.trim().toLowerCase()))],
        dto.subject.trim(),
        dto.body.trim(),
        dto.includeClient,
        user.id,
      ],
    );
    await this.history(
      this.dependencies.db,
      id,
      user.id,
      'CHANGE.COMMUNICATION_DRAFTED',
      {
        communicationId: r.rows[0].id,
        recipientCount: dto.recipientEmails.length,
      },
    );
    return r.rows[0];
  }
  async queueCommunication(
    id: string,
    communicationId: string,
    user: AuthenticatedUser,
  ) {
    await this.assertVisible(id, user);
    if (!this.coordinator(user)) throw new ForbiddenException();
    return changeTransaction(this.dependencies, async (db) => {
      const result = await queueChangeEmail(db, id, communicationId, user.id);
      await recordChangeEvent(db, id, user.id, 'CHANGE.COMMUNICATION_QUEUED', {
        communicationId,
      });
      return result;
    });
  }
  async calendar(user: AuthenticatedUser, from?: string, to?: string) {
    this.requireAccess(user);
    const scope = this.scopeSql(user);
    const o = scope.values.length;
    const r = await this.dependencies.db.query(
      `SELECT id,change_number,title,status,risk,planned_start,planned_end FROM changes c WHERE ${scope.sql} AND planned_start IS NOT NULL AND ($${o + 1}::timestamptz IS NULL OR planned_end >= $${o + 1}) AND ($${o + 2}::timestamptz IS NULL OR planned_start <= $${o + 2}) ORDER BY planned_start`,
      [...scope.values, from || null, to || null],
    );
    return r.rows;
  }
}

@ApiTags('Change Management')
@Controller('changes')
export class ChangeController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: ChangeService,
  ) {}
  @Get('options') async options(@Req() r: FastifyRequest) {
    return this.service.options(await this.auth.currentUser(r));
  }

  @Post('contacts') async createContact(
    @Req() r: FastifyRequest,
    @Body() b: CreateChangeContactDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.createContact(await this.auth.currentUser(r), b);
  }
  @Get('dashboard') async dashboard(@Req() r: FastifyRequest) {
    return this.service.dashboard(await this.auth.currentUser(r));
  }
  @Get('calendar') async calendar(
    @Req() r: FastifyRequest,
    @Query('from') f?: string,
    @Query('to') t?: string,
  ) {
    return this.service.calendar(await this.auth.currentUser(r), f, t);
  }
  @Get() async list(@Req() r: FastifyRequest, @Query() q: ChangeQuery) {
    return this.service.list(await this.auth.currentUser(r), q);
  }
  @Post() async create(@Req() r: FastifyRequest, @Body() b: CreateChangeDto) {
    await this.auth.verifyCsrf(r);
    return this.service.create(await this.auth.currentUser(r), b);
  }
  @Get(':id') async detail(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.detail(id, await this.auth.currentUser(r));
  }
  @Patch(':id/status') async status(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeStatusDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.status(id, await this.auth.currentUser(r), b);
  }
  @Post(':id/teams') async team(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeTeamDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.addTeam(id, await this.auth.currentUser(r), b);
  }
  @Post(':id/tasks') async task(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeTaskDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.addTask(id, await this.auth.currentUser(r), b);
  }
  @Patch(':id/tasks/:taskId') async taskUpdate(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() b: ChangeTaskUpdateDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.updateTask(
      id,
      taskId,
      await this.auth.currentUser(r),
      b,
    );
  }
  @Post(':id/approvals') async approval(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeApprovalDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.addApproval(id, await this.auth.currentUser(r), b);
  }
  @Patch(':id/approvals/:approvalId') async decision(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('approvalId', new ParseUUIDPipe()) approvalId: string,
    @Body() b: ChangeDecisionDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.decide(
      id,
      approvalId,
      await this.auth.currentUser(r),
      b,
    );
  }
  @Post(':id/updates') async update(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeUpdateDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.addUpdate(id, await this.auth.currentUser(r), b);
  }
  @Post(':id/tickets') async link(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeTicketLinkDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.linkTicket(id, await this.auth.currentUser(r), b);
  }
  @Post(':id/stakeholders') async stakeholder(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeStakeholderDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.addStakeholder(id, await this.auth.currentUser(r), b);
  }
  @Post(':id/attachments') async addAttachment(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeAttachmentDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.addAttachment(id, await this.auth.currentUser(r), b);
  }
  @Get(':id/attachments/:attachmentId') async attachment(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.service.attachment(
      id,
      attachmentId,
      await this.auth.currentUser(r),
    );
    reply.header('content-type', file.content_type);
    reply.header('x-content-type-options', 'nosniff');
    reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
    );
    return reply.send(file.content);
  }
  @Post(':id/communications') async communication(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeCommunicationDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.communication(id, await this.auth.currentUser(r), b);
  }
  @Post(':id/communications/:communicationId/send') async queueCommunication(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('communicationId', new ParseUUIDPipe()) communicationId: string,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.queueCommunication(
      id,
      communicationId,
      await this.auth.currentUser(r),
    );
  }
}
