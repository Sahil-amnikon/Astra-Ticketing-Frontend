# Phase 2 v16

Phase 2 v16 is a cumulative, migration-free update to the v15 ticketing release.

## Included

- Administrators can search Microsoft Entra ID by first name, last name,
  display name, work email, or UPN.
- Directory searches return up to ten candidates and require an explicit account
  selection before access is provisioned.
- Team Leads and Managers can list, create, edit, deactivate, and delete ticket
  categories. Other administration areas remain restricted to Administrators.
- The Management navigation includes Categories.
- Audit event names include the maintained administration record types.
- Audit details render as readable labels and before/after values instead of raw
  JSON.

## Deployment

No database migration is included. Build the v16 images and run the migration
command as a safety check; it must report an applied count of zero.

## Acceptance checks

1. Search for an Entra user using part of the person's first or last name.
2. Select the intended account from the returned matches and provision access.
3. Sign in as a Team Lead, open Management, and create or edit a category.
4. Confirm the Team Lead cannot open Users & Access or other administrator-only
   configuration.
5. Open Audit History and confirm event details show readable field changes.
