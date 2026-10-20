import {
  Injectable,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { readConfig } from './config';

type JsonObject = Record<string, unknown>;

export interface EntraDirectoryUser {
  id: string;
  displayName: string;
  email: string;
  userPrincipalName: string;
}

@Injectable()
export class EntraDirectoryService {
  private readonly config = readConfig();
  private cachedToken?: { value: string; expiresAt: number };

  async findByIdentifier(identifier: string): Promise<EntraDirectoryUser> {
    const normalized = identifier.trim().toLowerCase();
    const escaped = normalized.replaceAll("'", "''");
    const query = new URLSearchParams({
      $filter: `userPrincipalName eq '${escaped}' or mail eq '${escaped}'`,
      $select: 'id,displayName,mail,userPrincipalName',
      $top: '2',
    });
    const body = await this.graphRequest(`/users?${query.toString()}`);
    const users = Array.isArray(body.value) ? body.value : [];
    if (users.length > 1)
      throw new ConflictException(
        'More than one directory account matches. Use the exact Entra UPN.',
      );
    if (!users.length) throw new NotFoundException();
    return this.parseUser(users[0]);
  }

  async search(identifier: string): Promise<EntraDirectoryUser[]> {
    const normalized = identifier.trim();
    const escaped = normalized.replaceAll("'", "''");
    const filter = [
      `startsWith(displayName,'${escaped}')`,
      `startsWith(givenName,'${escaped}')`,
      `startsWith(surname,'${escaped}')`,
      `startsWith(userPrincipalName,'${escaped}')`,
      `startsWith(mail,'${escaped}')`,
    ].join(' or ');
    const query = new URLSearchParams({
      $filter: filter,
      $select: 'id,displayName,mail,userPrincipalName',
      $top: '10',
    });
    const body = await this.graphRequest(`/users?${query.toString()}`);
    const users = Array.isArray(body.value) ? body.value : [];
    return users.map((user) => this.parseUser(user));
  }

  async findById(objectId: string): Promise<EntraDirectoryUser> {
    const query = new URLSearchParams({
      $select: 'id,displayName,mail,userPrincipalName',
    });
    const body = await this.graphRequest(
      `/users/${encodeURIComponent(objectId)}?${query.toString()}`,
    );
    return this.parseUser(body);
  }

  private entraConfig() {
    const { ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET, ENTRA_TENANT_ID } =
      this.config;
    if (!ENTRA_CLIENT_ID || !ENTRA_CLIENT_SECRET || !ENTRA_TENANT_ID) {
      throw new ServiceUnavailableException();
    }
    return {
      clientId: ENTRA_CLIENT_ID,
      clientSecret: ENTRA_CLIENT_SECRET,
      tenantId: ENTRA_TENANT_ID,
    };
  }

  private async accessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }
    const { clientId, clientSecret, tenantId } = this.entraConfig();
    let response: Response;
    try {
      response = await fetch(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
            scope: 'https://graph.microsoft.com/.default',
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new ServiceUnavailableException();
    }
    if (!response.ok) throw new ServiceUnavailableException();
    const body = (await response.json()) as JsonObject;
    if (typeof body.access_token !== 'string') {
      throw new ServiceUnavailableException();
    }
    const expiresIn =
      typeof body.expires_in === 'number' ? body.expires_in : 3600;
    this.cachedToken = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(60, expiresIn - 120) * 1000,
    };
    return body.access_token;
  }

  private async graphRequest(path: string): Promise<JsonObject> {
    const token = await this.accessToken();
    let response: Response;
    try {
      response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException();
    }
    if (response.status === 404) throw new NotFoundException();
    if (!response.ok) throw new ServiceUnavailableException();
    const body = (await response.json()) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ServiceUnavailableException();
    }
    return body as JsonObject;
  }

  private parseUser(value: unknown): EntraDirectoryUser {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ServiceUnavailableException();
    }
    const user = value as JsonObject;
    const email =
      (typeof user.mail === 'string' && user.mail) ||
      (typeof user.userPrincipalName === 'string' && user.userPrincipalName);
    if (
      typeof user.id !== 'string' ||
      typeof user.displayName !== 'string' ||
      typeof user.userPrincipalName !== 'string' ||
      !email
    ) {
      throw new ServiceUnavailableException();
    }
    return {
      id: user.id,
      displayName: user.displayName,
      email,
      userPrincipalName: user.userPrincipalName,
    };
  }
}
