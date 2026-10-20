import {
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto';
import type { PoolClient } from 'pg';
import { permissionsForRoles } from './access';
import { STAFF_GROUP_PERMISSIONS } from './group-permissions';
import { readConfig } from './config';
import { Dependencies } from './dependencies';

const SESSION_COOKIE = 'amnikon_session';
const STATE_TTL_SECONDS = 600;

type JsonObject = Record<string, unknown>;

interface LoginState {
  nonce: string;
  verifier: string;
  returnTo: string;
}

interface SessionRecord {
  csrfToken: string;
  userId: string;
  version?: number;
}

export interface AuthenticatedUser {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  clientIds: string[];
  siteIds?: string[];
  permissions?: string[];
  groupPermissions?: string[];
  workScope?: 'INTERNAL' | 'CLIENT' | 'BOTH' | 'ALL';
  changeAccess?:
    'NONE' | 'CONTRIBUTOR' | 'COORDINATOR' | 'APPROVER' | 'CHANGE_MANAGER';
  departmentIds?: string[];
  workspace?: 'operations' | 'management' | 'admin' | 'client';
}

export function workspaceUser(
  user: AuthenticatedUser,
  workspace: string,
): AuthenticatedUser {
  const administrator = user.roles.includes('ADMIN');
  if (workspace === 'admin') {
    if (!administrator)
      throw new ForbiddenException(
        'Administration workspace is not available.',
      );
    return { ...user, workspace: 'admin' };
  }
  if (workspace === 'client') {
    if (!user.roles.includes('USER'))
      throw new ForbiddenException('Client workspace is not available.');
    return {
      ...user,
      workspace: 'client',
      roles: ['USER'],
      permissions: [],
      changeAccess: 'NONE',
      workScope: 'CLIENT',
    };
  }
  if (workspace === 'management') {
    if (!user.roles.some((r) => ['ADMIN', 'MANAGER', 'TEAM_LEAD'].includes(r)))
      throw new ForbiddenException('Management workspace is not available.');
    const roles =
      administrator || user.roles.includes('MANAGER')
        ? ['MANAGER']
        : ['TEAM_LEAD'];
    return {
      ...user,
      workspace: 'management',
      roles,
      permissions: [
        ...new Set([
          ...permissionsForRoles(roles),
          ...(user.groupPermissions ?? []).filter((p) =>
            STAFF_GROUP_PERMISSIONS.includes(p),
          ),
        ]),
      ],
      changeAccess: administrator ? 'COORDINATOR' : user.changeAccess,
    };
  }
  if (workspace === 'operations') {
    if (
      !user.roles.some((r) =>
        ['ADMIN', 'MANAGER', 'TEAM_LEAD', 'TECHNICIAN', 'INTERN'].includes(r),
      )
    )
      throw new ForbiddenException('Technician workspace is not available.');
    const roles = user.roles.some((role) =>
      ['ADMIN', 'MANAGER', 'TEAM_LEAD', 'TECHNICIAN'].includes(role),
    )
      ? ['TECHNICIAN']
      : ['INTERN'];
    return {
      ...user,
      workspace: 'operations',
      roles,
      permissions: [
        ...new Set([
          ...permissionsForRoles(roles),
          ...(roles.includes('INTERN')
            ? []
            : (user.groupPermissions ?? [])
          ).filter((p) => STAFF_GROUP_PERMISSIONS.includes(p)),
        ]),
      ],
      changeAccess: user.changeAccess === 'NONE' ? 'NONE' : 'CONTRIBUTOR',
    };
  }
  throw new ForbiddenException('Select a valid workspace.');
}

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function parseJsonSegment(segment: string): JsonObject {
  const value: unknown = JSON.parse(
    Buffer.from(segment, 'base64url').toString('utf8'),
  );
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new UnauthorizedException();
  }
  return value as JsonObject;
}

function requiredClaim(claims: JsonObject, name: string): string {
  const value = claims[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new UnauthorizedException();
  }
  return value;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((item) => {
      const separator = item.indexOf('=');
      if (separator < 1) return [];
      const name = item.slice(0, separator).trim();
      const value = item.slice(separator + 1).trim();
      try {
        return [[name, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    }),
  );
}

const portalRoles: Record<string, string[]> = {
  '/client': ['USER'],
  '/operations': ['INTERN', 'TECHNICIAN', 'TEAM_LEAD', 'MANAGER', 'ADMIN'],
  '/management': ['TEAM_LEAD', 'MANAGER', 'ADMIN'],
  '/admin': ['ADMIN'],
};

function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && Object.hasOwn(portalRoles, value)
    ? value
    : '/';
}

export function destinationFor(roles: string[], requested: string): string {
  // The common sign-in page is also the workspace chooser for people who
  // legitimately have more than one workspace.
  if (requested === '/') return '/';
  if (portalRoles[requested]?.some((role) => roles.includes(role)))
    return requested;
  return '/';
}

@Injectable()
export class AuthService {
  private readonly config = readConfig();

  constructor(private readonly dependencies: Dependencies) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.ENTRA_CLIENT_ID &&
      this.config.ENTRA_CLIENT_SECRET &&
      this.config.ENTRA_TENANT_ID,
    );
  }

  private requireEntraConfig() {
    if (
      !this.config.ENTRA_CLIENT_ID ||
      !this.config.ENTRA_CLIENT_SECRET ||
      !this.config.ENTRA_TENANT_ID
    ) {
      throw new ServiceUnavailableException('Identity provider not configured');
    }
    return {
      clientId: this.config.ENTRA_CLIENT_ID,
      clientSecret: this.config.ENTRA_CLIENT_SECRET,
      tenantId: this.config.ENTRA_TENANT_ID,
    };
  }

  private callbackUrl(): string {
    return new URL('/api/auth/callback', this.config.APP_BASE_URL).toString();
  }

  private async ensureRedis(): Promise<void> {
    const redis = this.dependencies.redis;
    if (redis.status === 'wait' || redis.status === 'end') {
      await redis.connect();
    }
  }

  async beginLogin(returnTo?: unknown): Promise<string> {
    const { clientId, tenantId } = this.requireEntraConfig();
    await this.ensureRedis();
    const state = base64Url(randomBytes(32));
    const nonce = base64Url(randomBytes(32));
    const verifier = base64Url(randomBytes(48));
    const loginState: LoginState = {
      nonce,
      verifier,
      returnTo: safeReturnTo(returnTo),
    };
    await this.dependencies.redis.set(
      `oidc-state:${sha256(state).toString('hex')}`,
      JSON.stringify(loginState),
      'EX',
      STATE_TTL_SECONDS,
      'NX',
    );
    const url = new URL(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    );
    url.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: this.callbackUrl(),
      response_mode: 'query',
      scope: 'openid profile email',
      state,
      nonce,
      code_challenge: base64Url(sha256(verifier)),
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async completeLogin(
    code: string,
    state: string,
  ): Promise<{ token: string; destination: string }> {
    const { clientId, clientSecret, tenantId } = this.requireEntraConfig();
    await this.ensureRedis();
    const stateKey = `oidc-state:${sha256(state).toString('hex')}`;
    const stored = await this.dependencies.redis.getdel(stateKey);
    if (!stored) throw new UnauthorizedException();
    const loginState = JSON.parse(stored) as LoginState;

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.callbackUrl(),
          code_verifier: loginState.verifier,
          scope: 'openid profile email',
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!tokenResponse.ok) throw new UnauthorizedException();
    const tokenBody = (await tokenResponse.json()) as JsonObject;
    const idToken = requiredClaim(tokenBody, 'id_token');
    const claims = await this.verifyIdToken(idToken, loginState.nonce);
    const userId = await this.findOrProvisionUser(claims);

    const sessionToken = base64Url(randomBytes(48));
    const version = await this.dependencies.db.query<{
      session_version: number;
      roles: string[];
    }>(
      `SELECT u.session_version,
       ARRAY(SELECT role_code FROM user_roles WHERE user_id=u.id) AS roles
       FROM users u WHERE id = $1 AND active`,
      [userId],
    );
    if (!version.rows[0]) throw new UnauthorizedException();
    const session: SessionRecord = {
      version: version.rows[0].session_version,
      userId,
      csrfToken: base64Url(randomBytes(32)),
    };
    await this.dependencies.redis.set(
      `session:${sha256(sessionToken).toString('hex')}`,
      JSON.stringify(session),
      'EX',
      this.config.SESSION_TTL_SECONDS,
    );
    return {
      token: sessionToken,
      destination: destinationFor(version.rows[0].roles, loginState.returnTo),
    };
  }

  private async verifyIdToken(
    token: string,
    expectedNonce: string,
  ): Promise<JsonObject> {
    const { clientId, tenantId } = this.requireEntraConfig();
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
      throw new UnauthorizedException();
    }
    const header = parseJsonSegment(parts[0]);
    const claims = parseJsonSegment(parts[1]);
    if (header.alg !== 'RS256') throw new UnauthorizedException();
    const kid = requiredClaim(header, 'kid');
    const jwksResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!jwksResponse.ok) throw new UnauthorizedException();
    const jwks = (await jwksResponse.json()) as { keys?: JsonObject[] };
    const jwk = jwks.keys?.find((candidate) => candidate.kid === kid);
    if (!jwk) throw new UnauthorizedException();
    const validSignature = verifySignature(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url'),
    );
    if (!validSignature) throw new UnauthorizedException();

    const now = Math.floor(Date.now() / 1000);
    const expires = claims.exp;
    const notBefore = claims.nbf;
    if (
      claims.aud !== clientId ||
      claims.iss !== `https://login.microsoftonline.com/${tenantId}/v2.0` ||
      claims.tid !== tenantId ||
      claims.nonce !== expectedNonce ||
      typeof expires !== 'number' ||
      expires <= now - 60 ||
      (typeof notBefore === 'number' && notBefore > now + 60)
    ) {
      throw new UnauthorizedException();
    }
    return claims;
  }

  private async findOrProvisionUser(claims: JsonObject): Promise<string> {
    const tenantId = requiredClaim(claims, 'tid');
    const objectId = requiredClaim(claims, 'oid');
    const email =
      (typeof claims.preferred_username === 'string' &&
        claims.preferred_username) ||
      (typeof claims.email === 'string' && claims.email) ||
      '';
    const displayName = requiredClaim(claims, 'name');
    if (!email) throw new ForbiddenException();

    const client = await this.dependencies.db.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{
        id: string;
        active: boolean;
      }>(
        `SELECT id, active FROM users
         WHERE entra_tenant_id = $1 AND entra_object_id = $2
         FOR UPDATE`,
        [tenantId, objectId],
      );
      let userId = existing.rows[0]?.id;
      if (userId) {
        if (!existing.rows[0]?.active) throw new ForbiddenException();
        await client.query(
          `UPDATE users
           SET email = $1, display_name = $2, last_login_at = now(), updated_at = now()
           WHERE id = $3`,
          [email, displayName, userId],
        );
      } else {
        userId = await this.provisionFirstAdministrator(
          client,
          tenantId,
          objectId,
          email,
          displayName,
        );
      }
      await client.query('COMMIT');
      return userId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async provisionFirstAdministrator(
    client: PoolClient,
    tenantId: string,
    objectId: string,
    email: string,
    displayName: string,
  ): Promise<string> {
    const allowed = new Set(
      this.config.INITIAL_ADMIN_OBJECT_IDS.split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    );
    // Serialize the empty-database check so two simultaneous first logins cannot
    // both provision administrators.
    await client.query('SELECT pg_advisory_xact_lock($1)', [537001]);
    const count = await client.query<{ count: string }>(
      'SELECT count(*)::text AS count FROM users',
    );
    if (count.rows[0]?.count !== '0' || !allowed.has(objectId.toLowerCase())) {
      throw new ForbiddenException();
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO users
         (entra_object_id, entra_tenant_id, email, display_name, last_login_at)
       VALUES ($1, $2, $3, $4, now()) RETURNING id`,
      [objectId, tenantId, email, displayName],
    );
    const userId = inserted.rows[0]?.id;
    if (!userId) throw new ServiceUnavailableException();
    await client.query(
      `INSERT INTO user_roles (user_id, role_code, granted_by)
       VALUES ($1, 'ADMIN', $1)`,
      [userId],
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'IDENTITY.FIRST_ADMIN_PROVISIONED', 'USER', $2, $3::jsonb)`,
      [userId, userId, JSON.stringify({ tenantId, objectId })],
    );
    return userId;
  }

  private async readSession(request: FastifyRequest): Promise<SessionRecord> {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!token) throw new UnauthorizedException();
    await this.ensureRedis();
    const value = await this.dependencies.redis.get(
      `session:${sha256(token).toString('hex')}`,
    );
    if (!value) throw new UnauthorizedException();
    return JSON.parse(value) as SessionRecord;
  }

  async currentUser(request: FastifyRequest): Promise<AuthenticatedUser> {
    const session = await this.readSession(request);
    const result = await this.dependencies.db.query<{
      id: string;
      display_name: string;
      email: string;
      active: boolean;
      session_version: number;
      roles: string[];
      client_ids: string[];
      site_ids: string[];
      permissions: string[];
      group_permissions?: string[];
      work_scope: AuthenticatedUser['workScope'];
      change_access: AuthenticatedUser['changeAccess'];
      department_ids: string[];
    }>(
      `SELECT u.id, u.display_name, u.email, u.active, u.session_version,u.work_scope,u.change_access,
         COALESCE(array_agg(DISTINCT ur.role_code) FILTER (WHERE ur.role_code IS NOT NULL), '{}') AS roles,
         COALESCE(array_agg(DISTINCT cu.client_id::text) FILTER (WHERE cu.client_id IS NOT NULL), '{}') AS client_ids,
         COALESCE(array_agg(DISTINCT us.site_id::text) FILTER (WHERE us.site_id IS NOT NULL), '{}') AS site_ids,
         COALESCE(array_agg(DISTINCT up.permission_code) FILTER (WHERE up.permission_code IS NOT NULL), '{}') AS permissions
         ,COALESCE(array_agg(DISTINCT du.department_id::text) FILTER (WHERE du.department_id IS NOT NULL), '{}') AS department_ids,
         ARRAY(SELECT DISTINCT p FROM access_groups g JOIN staff_group_members gm ON gm.group_id=g.id CROSS JOIN unnest(g.permissions) p WHERE gm.user_id=u.id AND g.kind='STAFF' AND g.active) AS group_permissions
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN client_users cu ON cu.user_id = u.id
       LEFT JOIN user_sites us ON us.user_id = u.id
       LEFT JOIN user_permissions up ON up.user_id = u.id
       LEFT JOIN department_users du ON du.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [session.userId],
    );
    const row = result.rows[0];
    if (!row?.active || (session.version ?? 0) !== row.session_version)
      throw new UnauthorizedException();
    const user: AuthenticatedUser = {
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      roles: row.roles,
      clientIds: row.client_ids,
      siteIds: row.site_ids,
      permissions: row.roles.includes('ADMIN')
        ? ['*']
        : permissionsForRoles(row.roles),
      workScope: row.roles.includes('ADMIN') ? 'ALL' : row.work_scope,
      changeAccess: row.roles.includes('ADMIN')
        ? 'CHANGE_MANAGER'
        : row.change_access,
      departmentIds: row.department_ids,
      groupPermissions: row.group_permissions ?? [],
    };
    const requested = request.headers['x-amnikon-workspace'];
    // Identity is exposed for the chooser only; domain APIs always use capped roles.
    if (requested === 'chooser' && request.url?.split('?')[0] === '/auth/me')
      return user;
    const workspace =
      typeof requested === 'string'
        ? requested
        : row.roles.includes('ADMIN')
          ? 'operations'
          : row.roles.some((r) => ['MANAGER', 'TEAM_LEAD'].includes(r))
            ? 'management'
            : row.roles.some((r) => ['INTERN', 'TECHNICIAN'].includes(r))
              ? 'operations'
              : 'client';
    const effective = workspaceUser(user, workspace);
    if (
      row.roles.includes('ADMIN') &&
      ['operations', 'management'].includes(workspace)
    ) {
      // Preserve existing client entitlement while removing administrative capabilities.
      const clients = await this.dependencies.db.query<{ id: string }>(
        'SELECT id FROM clients',
      );
      effective.clientIds = clients.rows.map((c) => c.id);
      effective.siteIds = [];
    }
    return effective;
  }

  hasPermission(user: AuthenticatedUser, permission: string): boolean {
    return (
      user.permissions?.includes('*') ||
      user.permissions?.includes(permission) ||
      false
    );
  }

  async requirePermission(
    request: FastifyRequest,
    permission: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.currentUser(request);
    if (!this.hasPermission(user, permission)) throw new ForbiddenException();
    return user;
  }

  async sessionView(request: FastifyRequest) {
    const session = await this.readSession(request);
    const user = await this.currentUser(request);
    return {
      configured: true,
      authenticated: true,
      user,
      csrfToken: session.csrfToken,
    };
  }

  async requireRoles(
    request: FastifyRequest,
    permitted: readonly string[],
  ): Promise<AuthenticatedUser> {
    const user = await this.currentUser(request);
    if (!user.roles.some((role) => permitted.includes(role))) {
      throw new ForbiddenException();
    }
    return user;
  }

  async verifyCsrf(request: FastifyRequest): Promise<void> {
    const origin = request.headers.origin;
    if (origin !== new URL(this.config.APP_BASE_URL).origin) {
      throw new ForbiddenException();
    }
    const supplied = request.headers['x-csrf-token'];
    const session = await this.readSession(request);
    if (typeof supplied !== 'string') throw new ForbiddenException();
    const expected = Buffer.from(session.csrfToken);
    const actual = Buffer.from(supplied);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new ForbiddenException();
    }
  }

  async logout(request: FastifyRequest): Promise<void> {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (token) {
      await this.ensureRedis();
      await this.dependencies.redis.del(
        `session:${sha256(token).toString('hex')}`,
      );
    }
  }

  sessionCookie(token: string): string {
    const secure = new URL(this.config.APP_BASE_URL).protocol === 'https:';
    return [
      `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/api',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${this.config.SESSION_TTL_SECONDS}`,
      secure ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ');
  }

  clearCookie(): string {
    const secure = new URL(this.config.APP_BASE_URL).protocol === 'https:';
    return [
      `${SESSION_COOKIE}=`,
      'Path=/api',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0',
      secure ? 'Secure' : '',
    ]
      .filter(Boolean)
      .join('; ');
  }
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Report whether Entra authentication is configured',
  })
  status() {
    return { configured: this.auth.isConfigured() };
  }

  @Get('login')
  @ApiOperation({ summary: 'Start Microsoft Entra sign-in' })
  async login(
    @Query('returnTo') returnTo: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    return reply.code(302).redirect(await this.auth.beginLogin(returnTo));
  }

  @Get('callback')
  @ApiOperation({ summary: 'Complete Microsoft Entra sign-in' })
  async callback(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    const query = request.query as Record<string, unknown>;
    if (typeof query.code !== 'string' || typeof query.state !== 'string') {
      throw new UnauthorizedException();
    }
    const login = await this.auth.completeLogin(query.code, query.state);
    reply.header('set-cookie', this.auth.sessionCookie(login.token));
    return reply.code(303).redirect(login.destination);
  }

  @Get('me')
  @ApiOperation({ summary: 'Return the authenticated user and CSRF token' })
  @ApiResponse({ status: 401, description: 'No valid application session' })
  me(@Req() request: FastifyRequest) {
    return this.auth.sessionView(request);
  }

  @Post('logout')
  @ApiOperation({ summary: 'End the application session' })
  async logout(@Req() request: FastifyRequest, @Res() reply: FastifyReply) {
    await this.auth.verifyCsrf(request);
    await this.auth.logout(request);
    reply.header('set-cookie', this.auth.clearCookie());
    return reply.send({ loggedOut: true });
  }
}
