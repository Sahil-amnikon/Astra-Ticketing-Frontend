# Site domain routing and ticket numbering

Administration → Customers → Sites shows each site's ticket prefix and configured domains. Administrators can choose Domains to add multiple exact customer-owned domains, edit them, and enable or disable routing. Each domain belongs to one customer and can be bound to one site. Shared domains spanning several sites must use the existing customer-level routing with explicit contact/site assignment; the same domain cannot be assigned twice.

The Site ticket prefix field accepts 2–16 uppercase letters or digits. Prefixes are reserved globally across customers, sites and historical number prefixes. Existing sites receive distinct generated prefixes, such as AAHCS001. New sites can use a chosen prefix or generate one automatically. Prefix changes apply only to future cases and do not reset that site's sequence. Old prefixes stay reserved and existing ticket numbers are unchanged.

Cases with a site use that site's independent number series, such as AAHCHQ-000001 and AAHCBR-000001. Cases without a site retain customer numbering. Number allocation and ticket creation share a database transaction; concurrent allocations serialize on the corresponding counter row, and failed creations roll back allocation. Numbers over six digits are retained without truncation.

Email-verified support intake uses its configured domain/customer/site mapping. Signed-in client requests also honor active email-domain routing for their explicitly linked contact. Domain rules do not grant additional customer or site membership. Wrong-customer selections, conflicting contact/site assignments and attempts to override a fixed site are rejected. Domain rule edits expire email-verification sessions and reject stale revisions. Existing submitted tickets are retained.

The Tickets action on a site opens the ticket queue with both customer and site filters. The backend still enforces customer and site permissions.

Migration 024 adds site prefixes, a prefix reservation registry, site counters and the shared number allocation function. Deployment validates a backup before migration and runs a real PostgreSQL case-creation check in a rollback-only transaction. It creates no persistent sample cases or customer domains and sends no test emails. Application rollback keeps additive numbering data and history.

Validation includes embedded PostgreSQL migration, counter and isolation tests; API checks; Edge tests for domain management, fixed-site client intake and site queue navigation; and desktop/mobile visual inspection.
