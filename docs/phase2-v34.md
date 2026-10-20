# Phase 2 v34

V34 corrects organization-dependent selections in ticket and change intake.

## Change stakeholders

- Change stakeholders selected from the directory are client-side contacts,
  filtered to the selected organization.
- A contact from another organization is rejected by the API even if a caller
  bypasses the browser form.
- Vendors and other participants can still be recorded manually by name/email.
- Stakeholder records do not grant an Amnikon staff portal account or change
  access. Staff involvement is controlled separately by owner, departments,
  tasks and approvals.

## Sites and internal locations

- Change sites are filtered immediately when the organization changes.
- The API verifies that the selected site belongs to the selected organization.
- Client tickets continue to use configured client sites.
- Internal tickets use a free-text **Location / project** field alongside the
  required internal department.

## Departments and expertise

Departments are internal Amnikon operational teams. They are used for internal
ticket routing, Change Management lead/implementation/review teams, department
approvals, intern specialist-help requests and future workload reporting.
Expertise records the skills available in each team. Departments are not clients
or sites.

Migration `015_client_change_stakeholders_internal_locations.cjs` advances the
schema from 14 to 15. It adds contact-backed change stakeholders and the optional
ticket location field without deleting existing changes, tickets or stakeholder
records.
