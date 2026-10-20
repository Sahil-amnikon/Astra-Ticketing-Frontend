# Phase 1 v7 — consolidated administration

## Release status

Cumulative successor to v5 and v6. V5 remains the operator-confirmed LAB baseline;
v6 was prepared but never deployed. See validation.md for executed checks and
outstanding LAB gates. This release is not Phase 1 acceptance or permission to
start Phase 2.

## Implemented

- Branded Microsoft-only sign-in. Callback failures return a readable sign-in
  message with a diagnostic reference; credentials and upstream error text are
  not returned or logged.
- Responsive administration shell, sidebar, overview counts and recent activity.
- Separate URLs for users, clients, contacts, sites, assets, categories, tags and
  audit history. Unknown section URLs return 404.
- Server-side pagination, text search and status filtering. Client filters apply
  to users, contacts, sites and assets. Empty/error/loading states are distinct.
- Existing v6 exact Graph lookup and backend revalidation on provisioning.
- Edit forms for core records, multi-role/multi-client user access and activation.
  Failed saves preserve inputs. No destructive record deletion is exposed.
- Last-active-admin protection serialized by an advisory transaction lock.
  The editing administrator's rights are rechecked after acquiring that lock.
- Access edits increment a database session version. Old Redis sessions become
  invalid, including after account reactivation. Roles remain checked per request.
- Immutable normal-user audit history, with before/after values for edits.
- Client ownership cannot be reassigned through ordinary record edits; asset/site
  membership is enforced by the existing composite foreign key. Category edits
  reject cycles under a shared category-edit lock.

## Access policy

USER requires at least one client membership. All existing staff roles currently
have cross-client visibility, as in v6. Selecting a staff role and USER together
therefore grants staff visibility. The form states this explicitly. Granular
staff-client restrictions and delegated admin roles are future work.

Azure identity lookup is not account-enabled, group or enterprise-application
assignment validation. Application User.ReadBasic.All with admin consent is the
intended basic lookup permission. Keep the Graph call restricted to the existing
id/displayName/mail/userPrincipalName select list and validate it against the LAB
tenant. Existing login does not call Graph. Entra administrator privileges do not
automatically map to Amnikon ADMIN.

Client/contact/site/asset/category/tag inactive states describe records; changing
those states does not deactivate related user accounts. User deactivation is an
explicit access-management action. Audit records are retained when users lose access.

## Database migration 003

Adds users.session_version with default 0 and grants DELETE only on user_roles and
client_users association tables so memberships can be replaced transactionally.
No existing identities or core records are deleted by the migration. Application
readiness now requires schema version 3. Existing version-0 sessions remain usable
until the user's access is changed or the normal session expires.

Do not edit historical migrations. Clean installs apply 001, 002 and 003; upgrading
v5/v6 applies only 003. Repeat migration must apply zero changes.

## LAB upgrade sequence (review before execution)

1. Record current image IDs/tag and service health. Back up the database and retain
   the current application directory and .env securely on the existing hosts.
2. Verify the v7 ZIP checksum before extraction. The ZIP excludes .env, secrets,
   node_modules, database dumps, browser results and compiled output.
3. Extract to a NEW sibling release directory, then copy the existing .env into it
   locally with restricted permissions. Keep compose project name amnikon-web.
4. Set a unique RELEASE_TAG such as phase1-v7-lab-20260915 in that new .env. Keep
   INITIAL_ADMIN_OBJECT_IDS blank and all current URLs, ports and secrets intact.
5. Build backend and frontend images with the new release tag. Do not replace
   running services if either build fails.
6. Run the migrate service from the new image using the owner migration URL.
   Expected: one applied migration on v5. Run again: zero applied.
7. Start backend, worker and frontend from v7. Check health/readiness and logs.
8. Validate existing login, Graph lookup, record creation/editing, audit history,
   multi-user/client isolation, session revocation and last-admin protection.
9. Keep v5 images, directory and backup until acceptance. Confirm replacement
   administrators can actually log in before demoting the original administrator.

Rollback: point Compose back to the retained v5 image tag and previous directory.
Migration 003 is additive and v5 can run against schema 3. Stop v7 before rollback;
clear application sessions during controlled rollback, because v5 does not check
session versions. Do not run destructive migration down commands against LAB data.
Restore the pre-upgrade database only if required after evaluating newer records.

No deployment commands have been executed against TKTWeb or TKTdb by this work.
