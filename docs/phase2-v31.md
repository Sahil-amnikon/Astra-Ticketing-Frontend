# Phase 2 v31

V31 is a cumulative access-management simplification built from v30. It keeps
database schema 12 and all v30 interface and notification corrections.

## Role profiles

The user-access form now assigns one understandable staff profile instead of
combining multiple roles with individual permission codes.

| Profile       | Included access                                                             |
| ------------- | --------------------------------------------------------------------------- |
| Technician    | Assigned-ticket work, authorized Site Team Tickets, assignment and transfer |
| Team Lead     | Technician access, team oversight, category and tag management, reports     |
| Manager       | Team Lead access, approvals, SLA management, reports and audit review       |
| Administrator | Full system and configuration control                                       |

- The API derives stored permissions from the selected role and does not trust
  custom permission values submitted by a client.
- Existing accounts receive their role profile immediately at sign-in; they do
  not need to be opened and saved individually after deployment.
- A user can have one primary profile, removing contradictory role combinations.
- Non-administrators must be assigned one or more clients in the form.
- Multiple-client assignment remains supported.
- Optional site assignment narrows Site Team Tickets to the selected locations.
  With no sites selected, the assigned clients' sites remain available.
- Administrators do not require client or site assignment.

The deferred client/end-user portal is not exposed as a normal access profile.

## Deployment

V31 has no database migration. Running the migrator is safe and should return a
count of `0` on a current v30 database.
