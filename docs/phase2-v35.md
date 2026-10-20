# Phase 2 v35

V35 integrates Change Management into the normal staff portals and simplifies
how internal routing and client stakeholders are configured.

## Change Management access and navigation

- Change Management is a normal navigation item in the Administration,
  Management and Technician portals rather than a separate workspace.
- An administrator controls each person's Change access from **Users & Access**:
  No access, Contributor, Coordinator, Approver or Change Manager.
- Users without Change access do not see the item and remain blocked by the API.
- Administrators retain full Change Management access.

## Client stakeholders

- Stakeholders are client-side contacts, not Amnikon technicians.
- A contact may apply to the whole client organization or one configured site.
- Change intake shows organization-wide contacts plus contacts belonging to the
  selected site.
- A missing contact can be created inside Change intake. It is saved in Contacts,
  audited and selected for that change.
- Vendors and other external participants can still be entered by email.

## Departments and expertise

Departments are optional internal routing metadata, configured on each person in
**Users & Access**. They help route internal tickets, select Change implementation
teams and approvals, and locate expertise for specialist-help requests. They do
not grant client access or application permissions. The separate Departments page
has been removed from navigation; six practical department choices are seeded when
they do not already exist.

## Change mailbox

`changes@amnikontechnologies.com` is the placeholder Change mailbox. Delivery and
reply capture remain disabled until the real shared Microsoft 365 mailbox, Graph
permissions and inbound-mail processing are approved and configured. The product
does not claim to send or receive Change email while disabled.

Migration `016_site_contacts_change_navigation.cjs` advances schema 15 to 16. It
adds optional site ownership to contacts and seeds missing internal departments.
Existing contacts remain organization-wide and existing records are preserved.
