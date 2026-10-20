import {
  Injectable,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth';

export function operationalWrite(method: string, route: string): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return false;
  const path = (route.split('?')[0] ?? '').replace(/\/$/, '');
  // Saved filters are personal preferences, not changes to service records.
  if (/^\/tickets\/views(?:\/|$)/.test(path)) return false;
  if (/^\/(tickets|changes|problems)(?:\/|$)/.test(path)) return true;
  if (/^\/internal\/tickets(?:\/|$)/.test(path)) return true;
  if (/^\/mail\/intake(?:\/|$)/.test(path)) return true;
  if (/^\/knowledge\/[^/]+\/tickets$/.test(path)) return true;
  // CAB groups, policy, templates and blackout windows remain configurable.
  return (
    /^\/change-governance\/[^/]+(?:\/|$)/.test(path) &&
    !/^\/change-governance\/(groups|policy|templates|blackouts)(?:\/|$)/.test(
      path,
    )
  );
}

@Injectable()
export class AdministrationReadOnlyGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    // Missing context defaults to a capped operational workspace in AuthService.
    // A workspace selection never grants a role or bypasses endpoint permissions.
    if (request.headers['x-amnikon-workspace'] !== 'admin') return true;
    const route = request.routeOptions?.url ?? request.url;
    if (!operationalWrite(request.method, route)) return true;
    await this.auth.verifyCsrf(request);
    const user = await this.auth.currentUser(request);
    if (user.workspace === 'admin') {
      throw new ForbiddenException(
        'Administration provides configuration and read-only service oversight. Switch to an authorized support workspace to work on records.',
      );
    }
    return true;
  }
}
