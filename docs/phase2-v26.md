# Phase 2 v26

V26 is the first controlled Phase 6 increment. It upgrades schema version 11 to
12 and retains all v25 ticket, search, scope and branding behavior.

## SLA calendars and paused clocks

- Administrators with `SLA_MANAGE` can create and edit named business-hour
  calendars with an IANA timezone, working weekdays, daily start/end time and
  dated holidays.
- Each priority policy selects one active calendar.
- New and explicitly recalculated SLA deadlines count only calendar working
  minutes. Existing ticket deadlines are preserved by the migration until an
  administrator selects **Apply to open tickets**.
- `WAITING_FOR_CLIENT`, `WAITING_FOR_VENDOR` and `ON_HOLD` pause response and
  resolution clocks. Leaving those statuses resumes from the stored remaining
  business minutes.
- Ticket views and filters expose the `PAUSED` SLA state and ticket details show
  the response deadline, resolution deadline and pause time.

## In-app notifications

- The worker polls every 30 seconds for SLA-at-risk, SLA-breached and tickets
  awaiting a first response for at least 30 business minutes.
- Ticket assignment, transfer and public-reply events enqueue notifications in
  their ticket transaction.
- Event keys prevent duplicate delivery. Notification listing re-applies the
  current user's client/site/ticket authorization.
- The top-bar notification centre polls once per minute, supports mark-read and
  mark-all-read, and provides per-user preferences for every event type.

## Deferred

Email, Teams, Missive and SMS delivery are not part of v26. Notifications remain
in-app only. Split shifts, per-client calendars and external escalation targets
can be added after the LAB workflow is accepted.
