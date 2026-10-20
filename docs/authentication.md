# Authentication

Phase 1 implements single-tenant Microsoft Entra OIDC authorization-code flow with
PKCE. The API creates one-time state and nonce values in Redis, exchanges the code
server-side, verifies the ID-token RS256 signature against the configured tenant's
JWKS, and validates issuer, audience, tenant, expiry, not-before and nonce claims.
Tokens and client secrets are never returned to the browser.

After sign-in, the browser receives an opaque, random, HTTP-only, SameSite=Lax
application-session cookie. Only its SHA-256 hash is used as the Redis key. Sessions
expire after `SESSION_TTL_SECONDS`; production cookies require HTTPS and include
the Secure flag. Mutating endpoints additionally require the per-session CSRF token
and the exact configured application origin.

There is no password database, mock identity, development impersonation or bypass.
An Entra identity can sign in only if an administrator provisioned its tenant/object
ID in `users`. The sole exception is the first account: when the database has no
users, an object ID listed in `INITIAL_ADMIN_OBJECT_IDS` may sign in and is atomically
created as ADMIN. Subsequent users are found by exact work email/UPN through Microsoft
Graph. The API obtains their immutable object ID, display name and email directly
from Entra and revalidates the object ID immediately before saving the user.

Configure the Entra web redirect URI exactly as:

```text
https://YOUR-INTERNAL-LAB-HOSTNAME/api/auth/callback
```

Interactive sign-in requests only `openid profile email`. Directory-backed user
provisioning additionally requires the Microsoft Graph application permission
`User.ReadBasic.All` with tenant administrator consent. The backend uses its existing
confidential-client credential to request a Graph `.default` token. Graph access
tokens and directory object IDs are not exposed as editable browser fields.

Enterprise Application assignment remains the Entra administrator's access gate.
Finding a directory user does not assign that person to the Enterprise Application;
both Entra assignment and an active application user record are required to sign in.
