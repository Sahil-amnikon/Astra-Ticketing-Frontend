# Phase 2 v39 LAB release

V39 adds Microsoft 365 incoming ticket creation and preserves sidebar position
between workspace pages. Migration 019 makes the ticket creator nullable so an
email-created ticket is attributed to **Email intake**, not to an administrator.
Existing tickets, roles, mailbox settings and encryption key are preserved.

Incoming email to `it@amnikontechnologies.com` creates a P3 General Support
ticket only if Graph delivers text, the message passes authentication checks,
the sender exactly matches one active contact of an active client, and the
contact's site (if set), EMAIL source and General Support category are active.
The existing client ticket prefix and SLA policy apply. Unmatched/ambiguous
contacts, staff-originated new messages, HTML that cannot be read as text,
unsupported attachments and unmatched replies remain for administrator review.
Automatic messages and CAB mail are ignored. A reply from the exact requester
with matching message references is added to staff ticket mail history. Known
staff replies continue to work. Repeated message IDs cannot create duplicate
tickets. The original email and accepted attachments remain on the staff mail
timeline. Incoming mail does not send an acknowledgment to the client.

Outgoing mail remains disabled unless an administrator independently enables
SMTP2GO in Email administration. Even when enabled, outbound ticket messages
only go to the scoped internal staff recipients. CAB outbound remains disabled.
The Microsoft 365 mailbox connection also remains disabled until an
administrator enables it in Email administration. Use an Entra application
with Graph application `Mail.Read` permission and tenant consent, scoped in
Exchange to the ticket mailbox only; verify this permission before enabling
incoming processing. The same configured Entra application credentials are
used by the worker. Mail received before the enable time is not imported.

To upgrade LAB: verify the package checksum, back up v38 code/database, extract
alongside v38, run `sh scripts/configure-v39-lab.sh`, build backend/frontend,
apply migrations twice (expect 1 then 0), recreate backend/worker/frontend,
wait for healthy services, and check sign-in and existing tickets. Test a new
known-contact email, a reply, an unknown address held for review, and the lower
sidebar links. Keep the inbound switch off until Graph mailbox access is
confirmed. If rollback is needed after migration, restore the verified pre-v39
database backup together with v38; rolling back images alone is insufficient.

Local validation uses an isolated PostgreSQL-compatible database; live Entra,
Graph, SMTP2GO and rendered LAB workflows remain acceptance checks.
