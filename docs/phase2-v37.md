# Phase 2 v37

V37 is a cumulative stakeholder and contact-lifecycle correction built from the
deployed v36 release. It adds no database migration.

## Change stakeholders

- The intake form uses one compact client-contact list rather than rendering
  every contact as a large checkbox card.
- **Add stakeholder** creates an explicit selected list whose entries can be
  removed before submission.
- **Add new contact** opens the contact form only when needed and keeps the new
  contact scoped to the selected organization and optional site.
- Contacts linked to internal staff roles are excluded using both the linked
  user ID and the normalized work email. The API enforces the same rule when a
  stakeholder is saved, so it cannot be bypassed by changing browser input.

## Contact removal

- An unused contact is permanently deleted after the existing typed `delete`
  confirmation.
- A contact referenced by ticket or change history is deactivated instead. It
  disappears from active selectors and lists while retained operational and
  audit history remains valid.
- Both outcomes create an audit record. The interface explains which outcome
  occurred.

## LAB configuration

`scripts/configure-v37-lab.sh` copies the existing v36 environment file when
needed, preserves its secrets and applies the approved v37 release values. This
removes the need to edit `.env` manually.

V37 is a LAB-validation candidate, not production acceptance. Stakeholder
filtering, contact deletion/deactivation and the rendered responsive form remain
deployment acceptance checks.
