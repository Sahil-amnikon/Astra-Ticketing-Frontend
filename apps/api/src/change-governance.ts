import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
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
  Min,
  MinLength,
} from 'class-validator';
import type { FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { AuthService, type AuthenticatedUser } from './auth';
import { Dependencies } from './dependencies';
import { ChangeService } from './changes';
import {
  approvalReadiness,
  changeTransaction,
  isChangeCoordinator,
  lockedChange,
  recordChangeEvent,
  schedulingConflicts,
  validateWindow,
} from './change-governance-rules';

export class CabGroupDto {
  @IsString() @MinLength(2) @MaxLength(100) name!: string;
  @IsInt() @Min(1) @Max(50) quorum!: number;
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  memberIds!: string[];
  @IsBoolean() active = true;
}
export class ChangePolicyDto {
  @IsBoolean() highRiskCab!: boolean;
  @IsInt() @Min(1) @Max(10) minimumApprovals!: number;
  @IsBoolean() reviewRequired!: boolean;
}
export class ChangeTemplateDto {
  @IsString() @MinLength(2) @MaxLength(150) name!: string;
  @IsIn([
    'SERVER',
    'CLOUD',
    'MICROSOFT_365',
    'NETWORK',
    'SECURITY',
    'APPLICATION',
    'OTHER',
  ])
  category!: string;
  @IsString() @MinLength(3) @MaxLength(10000) description!: string;
  @IsString() @MinLength(3) @MaxLength(10000) implementationPlan!: string;
  @IsString() @MinLength(3) @MaxLength(10000) testPlan!: string;
  @IsString() @MinLength(3) @MaxLength(10000) rollbackPlan!: string;
  @IsBoolean() active = true;
}
export class BlackoutDto {
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() siteId?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsBoolean() active = true;
}
export class ChangeAmendDto {
  @IsInt() @Min(1) revision!: number;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
  @IsOptional() @IsDateString() plannedStart?: string;
  @IsOptional() @IsDateString() plannedEnd?: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) risk?: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(10000)
  implementationPlan?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(10000) testPlan?: string;
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(10000)
  rollbackPlan?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(150, { each: true })
  affectedResources?: string[];
}
export class CabRequestDto {
  @IsUUID() groupId!: string;
}
export class ChangeReviewDto {
  @IsIn(['SUCCESS', 'PARTIAL', 'FAILED', 'ROLLED_BACK']) outcome!: string;
  @IsString() @MinLength(10) @MaxLength(10000) summary!: string;
  @IsString() @MinLength(2) @MaxLength(10000) followUp!: string;
}

@Injectable()
export class ChangeGovernanceService {
  constructor(
    private readonly dependencies: Dependencies,
    private readonly changes: ChangeService,
  ) {}
  private admin(user: AuthenticatedUser) {
    if (!user.roles.includes('ADMIN'))
      throw new ForbiddenException('Administrator access is required.');
  }
  private async audit(
    user: AuthenticatedUser,
    action: string,
    id: string | null,
    details: object,
    db: Pick<PoolClient, 'query'> = this.dependencies.db,
  ) {
    await db.query(
      "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,$2,'CHANGE_GOVERNANCE',$3,$4::jsonb)",
      [user.id, action, id, JSON.stringify(details)],
    );
  }
  async configuration(user: AuthenticatedUser) {
    if (
      !user.roles.includes('ADMIN') &&
      (!user.changeAccess || user.changeAccess === 'NONE')
    )
      throw new ForbiddenException();
    const admin = user.roles.includes('ADMIN');
    const [policy, groups, templates, blackouts] = await Promise.all([
      this.dependencies.db.query(
        'SELECT * FROM change_governance_policy WHERE id=1',
      ),
      this.dependencies.db.query(
        `SELECT g.*,COALESCE(array_agg(m.user_id) FILTER(WHERE m.user_id IS NOT NULL),'{}') AS member_ids FROM cab_groups g LEFT JOIN cab_members m ON m.group_id=g.id WHERE ($1::boolean OR g.active) GROUP BY g.id ORDER BY g.name`,
        [admin],
      ),
      this.dependencies.db.query(
        'SELECT * FROM change_templates WHERE ($1::boolean OR active) ORDER BY name',
        [admin],
      ),
      this.dependencies.db.query(
        'SELECT b.*,c.name AS client_name,s.name AS site_name FROM change_blackouts b LEFT JOIN clients c ON c.id=b.client_id LEFT JOIN sites s ON s.id=b.site_id WHERE ($1::boolean OR (b.active AND (b.client_id IS NULL OR b.client_id=ANY($2::uuid[])))) ORDER BY starts_at DESC LIMIT 100',
        [admin, user.clientIds],
      ),
    ]);
    return {
      policy: policy.rows[0],
      groups: groups.rows.map((g) =>
        admin ? g : { id: g.id, name: g.name, quorum: g.quorum },
      ),
      templates: templates.rows,
      blackouts: blackouts.rows,
    };
  }
  async saveGroup(user: AuthenticatedUser, dto: CabGroupDto, id?: string) {
    this.admin(user);
    if (dto.memberIds.length < dto.quorum)
      throw new BadRequestException('CAB quorum cannot exceed its membership.');
    return changeTransaction(this.dependencies, async (db) => {
      const members = await db.query(
        "SELECT id FROM users WHERE id=ANY($1::uuid[]) AND active AND (change_access<>'NONE' OR EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=users.id AND ur.role_code='ADMIN'))",
        [dto.memberIds],
      );
      if (members.rowCount !== dto.memberIds.length)
        throw new BadRequestException(
          'All CAB members need active Change Management access.',
        );
      const group = id
        ? (
            await db.query(
              'UPDATE cab_groups SET name=$2,quorum=$3,active=$4 WHERE id=$1 RETURNING id',
              [id, dto.name.trim(), dto.quorum, dto.active],
            )
          ).rows[0]
        : (
            await db.query(
              'INSERT INTO cab_groups(name,quorum,active) VALUES($1,$2,$3) RETURNING id',
              [dto.name.trim(), dto.quorum, dto.active],
            )
          ).rows[0];
      if (!group) throw new BadRequestException('CAB group was not found.');
      await db.query('DELETE FROM cab_members WHERE group_id=$1', [group.id]);
      await db.query(
        'INSERT INTO cab_members(group_id,user_id) SELECT $1,unnest($2::uuid[])',
        [group.id, dto.memberIds],
      );
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'CAB.GROUP_SAVED','CAB_GROUP',$2,$3::jsonb)",
        [
          user.id,
          group.id,
          JSON.stringify({
            name: dto.name,
            quorum: dto.quorum,
            memberIds: dto.memberIds,
            active: dto.active,
          }),
        ],
      );
      return group;
    });
  }
  async policy(user: AuthenticatedUser, dto: ChangePolicyDto) {
    this.admin(user);
    return changeTransaction(this.dependencies, async (db) => {
      await db.query(
        'UPDATE change_governance_policy SET high_risk_cab=$1,minimum_approvals=$2,review_required=$3 WHERE id=1',
        [dto.highRiskCab, dto.minimumApprovals, dto.reviewRequired],
      );
      await this.audit(user, 'CAB.POLICY_UPDATED', null, dto, db);
      return { saved: true };
    });
  }
  async template(user: AuthenticatedUser, dto: ChangeTemplateDto, id?: string) {
    this.admin(user);
    return changeTransaction(this.dependencies, async (db) => {
      const fields = [
        dto.name.trim(),
        dto.category,
        dto.description.trim(),
        dto.implementationPlan.trim(),
        dto.testPlan.trim(),
        dto.rollbackPlan.trim(),
        dto.active,
      ];
      const result = id
        ? await db.query(
            'UPDATE change_templates SET name=$1,category=$2,description=$3,implementation_plan=$4,test_plan=$5,rollback_plan=$6,active=$7,updated_at=now() WHERE id=$8 RETURNING id',
            [...fields, id],
          )
        : await db.query(
            'INSERT INTO change_templates(name,category,description,implementation_plan,test_plan,rollback_plan,active,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
            [...fields, user.id],
          );
      if (!result.rows[0])
        throw new BadRequestException('Template was not found.');
      await this.audit(
        user,
        'CHANGE.TEMPLATE_SAVED',
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
  async blackout(user: AuthenticatedUser, dto: BlackoutDto, id?: string) {
    this.admin(user);
    validateWindow(dto.startsAt, dto.endsAt);
    if (dto.siteId && !dto.clientId)
      throw new BadRequestException(
        'A site blackout must specify its organization.',
      );
    return changeTransaction(this.dependencies, async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1)', [538001]);
      const fields = [
        dto.name.trim(),
        dto.clientId ?? null,
        dto.siteId ?? null,
        dto.startsAt,
        dto.endsAt,
        dto.active,
      ];
      const result = id
        ? await db.query(
            'UPDATE change_blackouts SET name=$1,client_id=$2,site_id=$3,starts_at=$4,ends_at=$5,active=$6 WHERE id=$7 RETURNING id',
            [...fields, id],
          )
        : await db.query(
            'INSERT INTO change_blackouts(name,client_id,site_id,starts_at,ends_at,active,created_by_user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
            [...fields, user.id],
          );
      if (!result.rows[0])
        throw new BadRequestException('Blackout was not found.');
      await db.query(
        "INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,details) VALUES($1,'CHANGE.BLACKOUT_SAVED','CHANGE_BLACKOUT',$2,$3::jsonb)",
        [user.id, result.rows[0].id, JSON.stringify(dto)],
      );
      return result.rows[0];
    });
  }
  async detail(id: string, user: AuthenticatedUser) {
    const change = await this.changes.assertVisible(id, user);
    const [readiness, conflicts, reviews] = await Promise.all([
      approvalReadiness(this.dependencies.db, change),
      schedulingConflicts(this.dependencies.db, change),
      this.dependencies.db.query(
        'SELECT r.*,u.display_name AS author_name FROM change_reviews r JOIN users u ON u.id=r.actor_user_id WHERE change_id=$1 ORDER BY r.created_at DESC',
        [id],
      ),
    ]);
    // Potential conflicts can refer to restricted changes. Never return their titles/IDs to a reviewer without access.
    const visibleConflicts = [];
    let restrictedConflictCount = 0;
    for (const other of conflicts.changes) {
      try {
        await this.changes.assertVisible(String(other.id), user);
        visibleConflicts.push(other);
      } catch (error) {
        if (
          error instanceof ForbiddenException ||
          (error as { getStatus?: () => number }).getStatus?.() === 404
        )
          restrictedConflictCount++;
        else throw error;
      }
    }
    return {
      readiness,
      conflicts: {
        ...conflicts,
        changes: visibleConflicts,
        restrictedConflictCount,
      },
      reviews: reviews.rows,
    };
  }
  async amend(id: string, user: AuthenticatedUser, dto: ChangeAmendDto) {
    await this.changes.assertVisible(id, user);
    if (!isChangeCoordinator(user)) throw new ForbiddenException();
    return changeTransaction(this.dependencies, async (db) => {
      await db.query('SELECT pg_advisory_xact_lock($1)', [538001]);
      const change = await lockedChange(db, id);
      if (change.revision !== dto.revision)
        throw new BadRequestException(
          'The change was updated by someone else. Reload before saving.',
        );
      if (
        ![
          'DRAFT',
          'SUBMITTED',
          'ASSESSMENT',
          'AWAITING_APPROVAL',
          'APPROVED',
          'SCHEDULED',
        ].includes(String(change.status))
      )
        throw new BadRequestException(
          'Implementation has begun or the change is finished. Raise a new change for further work.',
        );
      const start = dto.plannedStart ?? change.planned_start,
        end = dto.plannedEnd ?? change.planned_end;
      if (start || end) validateWindow(start, end);
      const resources = dto.affectedResources
        ? [
            ...new Set(
              dto.affectedResources
                .map((x) => x.trim().toLowerCase())
                .filter(Boolean),
            ),
          ]
        : change.affected_resources;
      await db.query(
        `UPDATE changes SET planned_start=$2,planned_end=$3,risk=$4,implementation_plan=$5,test_plan=$6,rollback_plan=$7,affected_resources=$8,
        revision=revision+1,cab_group_id=NULL,cab_quorum=0,status=CASE WHEN status='DRAFT' THEN 'DRAFT' ELSE 'ASSESSMENT' END,updated_at=now() WHERE id=$1`,
        [
          id,
          start ?? null,
          end ?? null,
          dto.risk ?? change.risk,
          dto.implementationPlan ?? change.implementation_plan,
          dto.testPlan ?? change.test_plan,
          dto.rollbackPlan ?? change.rollback_plan,
          resources,
        ],
      );
      await recordChangeEvent(db, id, user.id, 'CHANGE.REVISED', {
        previousRevision: change.revision,
        reason: dto.reason,
        after: dto,
      });
      return { id, revision: dto.revision + 1 };
    });
  }
  async requestCab(id: string, user: AuthenticatedUser, dto: CabRequestDto) {
    await this.changes.assertVisible(id, user);
    if (!isChangeCoordinator(user)) throw new ForbiddenException();
    return changeTransaction(this.dependencies, async (db) => {
      const change = await lockedChange(db, id);
      if (
        !['DRAFT', 'SUBMITTED', 'ASSESSMENT'].includes(String(change.status)) ||
        change.cab_group_id
      )
        throw new BadRequestException(
          'Request CAB in a new assessment round before sending for approval.',
        );
      const group = (
        await db.query(
          'SELECT * FROM cab_groups WHERE id=$1 AND active FOR SHARE',
          [dto.groupId],
        )
      ).rows[0];
      if (!group) throw new BadRequestException('Choose an active CAB group.');
      const members = await db.query(
        `SELECT u.id FROM cab_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=$1 AND u.active
        AND u.id<>$2 AND u.id<>$3 AND (EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_code='ADMIN')
          OR (u.change_access<>'NONE' AND EXISTS(SELECT 1 FROM client_users cu WHERE cu.user_id=u.id AND cu.client_id=$4)))`,
        [
          dto.groupId,
          change.requested_by_user_id,
          change.owner_user_id,
          change.client_id,
        ],
      );
      if ((members.rowCount ?? 0) < group.quorum)
        throw new BadRequestException(
          'Not enough independent CAB members have access to this client. Adjust group membership or quorum.',
        );
      for (const member of members.rows) {
        const vote = (
          await db.query(
            'INSERT INTO change_approvals(change_id,approver_user_id,required,sequence,revision,cab_group_id) VALUES($1,$2,false,1,$3,$4) RETURNING id',
            [id, member.id, change.revision, dto.groupId],
          )
        ).rows[0];
        await db.query(
          "INSERT INTO notifications(user_id,change_id,type,title,body,event_key) VALUES($1,$2,'CHANGE_APPROVAL_REQUESTED',$3,$4,$5) ON CONFLICT(event_key) DO NOTHING",
          [
            member.id,
            id,
            `CAB review requested: ${change.change_number}`,
            change.title,
            `cab:${vote.id}`,
          ],
        );
      }
      await db.query(
        'UPDATE changes SET cab_group_id=$2,cab_quorum=$3,updated_at=now() WHERE id=$1',
        [id, dto.groupId, group.quorum],
      );
      await recordChangeEvent(db, id, user.id, 'CAB.REVIEW_REQUESTED', {
        groupId: dto.groupId,
        quorum: group.quorum,
        revision: change.revision,
      });
      return { id };
    });
  }
  async review(id: string, user: AuthenticatedUser, dto: ChangeReviewDto) {
    await this.changes.assertVisible(id, user);
    if (!isChangeCoordinator(user)) throw new ForbiddenException();
    return changeTransaction(this.dependencies, async (db) => {
      const change = await lockedChange(db, id);
      if (
        !['COMPLETED', 'FAILED', 'ROLLED_BACK'].includes(String(change.status))
      )
        throw new BadRequestException(
          'Complete implementation and validation before recording its review.',
        );
      const result = await db.query(
        'INSERT INTO change_reviews(change_id,revision,outcome,summary,follow_up,actor_user_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [
          id,
          change.revision,
          dto.outcome,
          dto.summary.trim(),
          dto.followUp.trim(),
          user.id,
        ],
      );
      await recordChangeEvent(db, id, user.id, 'CHANGE.REVIEW_RECORDED', {
        reviewId: result.rows[0].id,
        outcome: dto.outcome,
        revision: change.revision,
      });
      return result.rows[0];
    });
  }
}

@Controller('change-governance')
export class ChangeGovernanceController {
  constructor(
    private readonly auth: AuthService,
    private readonly service: ChangeGovernanceService,
  ) {}
  @Get() async configuration(@Req() r: FastifyRequest) {
    return this.service.configuration(await this.auth.currentUser(r));
  }
  @Post('groups') async group(
    @Req() r: FastifyRequest,
    @Body() b: CabGroupDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.saveGroup(await this.auth.currentUser(r), b);
  }
  @Patch('groups/:id') async groupUpdate(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: CabGroupDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.saveGroup(await this.auth.currentUser(r), b, id);
  }
  @Patch('policy') async policy(
    @Req() r: FastifyRequest,
    @Body() b: ChangePolicyDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.policy(await this.auth.currentUser(r), b);
  }
  @Post('templates') async template(
    @Req() r: FastifyRequest,
    @Body() b: ChangeTemplateDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.template(await this.auth.currentUser(r), b);
  }
  @Patch('templates/:id') async templateUpdate(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeTemplateDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.template(await this.auth.currentUser(r), b, id);
  }
  @Post('blackouts') async blackout(
    @Req() r: FastifyRequest,
    @Body() b: BlackoutDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.blackout(await this.auth.currentUser(r), b);
  }
  @Patch('blackouts/:id') async blackoutUpdate(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: BlackoutDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.blackout(await this.auth.currentUser(r), b, id);
  }
  @Get(':id') async detail(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.detail(id, await this.auth.currentUser(r));
  }
  @Patch(':id') async amend(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeAmendDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.amend(id, await this.auth.currentUser(r), b);
  }
  @Post(':id/cab') async requestCab(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: CabRequestDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.requestCab(id, await this.auth.currentUser(r), b);
  }
  @Post(':id/reviews') async review(
    @Req() r: FastifyRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: ChangeReviewDto,
  ) {
    await this.auth.verifyCsrf(r);
    return this.service.review(id, await this.auth.currentUser(r), b);
  }
}
